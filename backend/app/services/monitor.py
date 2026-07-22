import asyncio
import json
import platform
import re
import secrets
import subprocess
from datetime import datetime
from datetime import timedelta

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    HealthCheck,
    Incident,
    Notification,
    Server,
    ServerMetric,
    ServerStatus,
)
from app.services.notifier import send_notification


async def run_http_check(check: HealthCheck) -> tuple[ServerStatus, float | None, str | None]:
    expected = check.expected_status or 200
    try:
        async with httpx.AsyncClient(timeout=check.timeout_seconds) as client:
            start = datetime.utcnow()
            response = await client.get(check.target)
            elapsed_ms = (datetime.utcnow() - start).total_seconds() * 1000
            if response.status_code == expected:
                return ServerStatus.HEALTHY, elapsed_ms, None
            return (
                ServerStatus.DEGRADED,
                elapsed_ms,
                f"Expected HTTP {expected}, got {response.status_code}",
            )
    except Exception as exc:
        return ServerStatus.DOWN, None, str(exc)


async def run_tcp_check(check: HealthCheck) -> tuple[ServerStatus, float | None, str | None]:
    match = re.match(r"^([^:/]+):(\d+)$", check.target.strip())
    if not match:
        return ServerStatus.DOWN, None, "TCP target must be host:port"

    host, port = match.group(1), int(match.group(2))
    start = datetime.utcnow()
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port),
            timeout=check.timeout_seconds,
        )
        writer.close()
        await writer.wait_closed()
        elapsed_ms = (datetime.utcnow() - start).total_seconds() * 1000
        return ServerStatus.HEALTHY, elapsed_ms, None
    except Exception as exc:
        return ServerStatus.DOWN, None, str(exc)


async def run_ping_check(check: HealthCheck) -> tuple[ServerStatus, float | None, str | None]:
    host = check.target.strip()
    param = "-n" if platform.system().lower() == "windows" else "-c"
    command = ["ping", param, "1", host]

    try:
        start = datetime.utcnow()
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=check.timeout_seconds,
        )
        elapsed_ms = (datetime.utcnow() - start).total_seconds() * 1000
        if result.returncode == 0:
            return ServerStatus.HEALTHY, elapsed_ms, None
        return ServerStatus.DOWN, elapsed_ms, result.stderr or "Ping failed"
    except Exception as exc:
        return ServerStatus.DOWN, None, str(exc)


async def execute_check(check: HealthCheck) -> tuple[ServerStatus, float | None, str | None]:
    if check.check_type.value == "http":
        return await run_http_check(check)
    if check.check_type.value == "tcp":
        return await run_tcp_check(check)
    if check.check_type.value == "ping":
        return await run_ping_check(check)
    return ServerStatus.UNKNOWN, None, f"Unsupported check type: {check.check_type}"


def worst_status(statuses: list[ServerStatus]) -> ServerStatus:
    priority = {
        ServerStatus.DOWN: 3,
        ServerStatus.DEGRADED: 2,
        ServerStatus.UNKNOWN: 1,
        ServerStatus.HEALTHY: 0,
    }
    if not statuses:
        return ServerStatus.UNKNOWN
    return max(statuses, key=lambda status: priority[status])


async def record_incident(
    db: AsyncSession,
    server: Server,
    title: str,
    message: str,
    severity: str = "critical",
    log_excerpt: str | None = None,
) -> Incident:
    excerpt = log_excerpt if log_excerpt is not None else server.last_log_excerpt
    incident = Incident(
        server_id=server.id,
        title=title,
        message=message,
        log_excerpt=excerpt,
        severity=severity,
    )
    db.add(incident)
    await db.flush()
    return incident


async def resolve_open_incidents(db: AsyncSession, server_id: int) -> None:
    result = await db.execute(
        select(Incident).where(
            Incident.server_id == server_id,
            Incident.resolved.is_(False),
        )
    )
    for incident in result.scalars().all():
        incident.resolved = True
        incident.resolved_at = datetime.utcnow()


async def notify_all(db: AsyncSession, title: str, message: str) -> None:
    result = await db.execute(
        select(Notification).where(Notification.enabled.is_(True))
    )
    for notification in result.scalars().all():
        await send_notification(notification, title, message)


async def run_health_check(db: AsyncSession, check_id: int) -> None:
    result = await db.execute(
        select(HealthCheck)
        .where(HealthCheck.id == check_id, HealthCheck.enabled.is_(True))
        .options()
    )
    check = result.scalar_one_or_none()
    if not check:
        return

    server_result = await db.execute(select(Server).where(Server.id == check.server_id))
    server = server_result.scalar_one()
    previous_status = server.status

    status, response_ms, error = await execute_check(check)
    check.last_status = status
    check.last_response_ms = response_ms
    check.last_error = error
    check.last_checked_at = datetime.utcnow()

    checks_result = await db.execute(
        select(HealthCheck).where(
            HealthCheck.server_id == server.id,
            HealthCheck.enabled.is_(True),
        )
    )
    all_checks = checks_result.scalars().all()
    server.status = worst_status([item.last_status for item in all_checks])
    server.last_checked_at = datetime.utcnow()
    server.last_error = error if server.status != ServerStatus.HEALTHY else None

    if previous_status not in {ServerStatus.DOWN, ServerStatus.DEGRADED} and server.status in {
        ServerStatus.DOWN,
        ServerStatus.DEGRADED,
    }:
        title = f"[DOWN] {server.name} ({server.environment})"
        message = (
            f"Server `{server.name}` is now {server.status.value}.\n"
            f"Host: {server.host}\n"
            f"Check: {check.name}\n"
            f"Error: {error or 'Health check failed'}"
        )
        if server.last_log_excerpt:
            message += f"\n\nRecent logs:\n{server.last_log_excerpt}"
        await record_incident(db, server, title, message)
        await notify_all(db, title, message)
    elif previous_status in {ServerStatus.DOWN, ServerStatus.DEGRADED} and server.status == ServerStatus.HEALTHY:
        title = f"[RECOVERED] {server.name} ({server.environment})"
        message = f"Server `{server.name}` is healthy again."
        await resolve_open_incidents(db, server.id)
        await notify_all(db, title, message)

    await db.commit()


async def process_agent_heartbeat(
    db: AsyncSession,
    token: str,
    cpu_percent: float,
    memory_percent: float,
    disk_percent: float,
    load_avg: float | None,
    log_excerpt: str | None = None,
) -> Server | None:
    result = await db.execute(select(Server).where(Server.agent_token == token))
    server = result.scalar_one_or_none()
    if not server:
        return None

    previous_status = server.status
    metric = ServerMetric(
        server_id=server.id,
        cpu_percent=cpu_percent,
        memory_percent=memory_percent,
        disk_percent=disk_percent,
        load_avg=load_avg,
    )
    db.add(metric)

    if log_excerpt:
        server.last_log_excerpt = log_excerpt[:8000]

    issues: list[str] = []
    if cpu_percent >= 90:
        issues.append(f"CPU at {cpu_percent:.1f}%")
    if memory_percent >= 90:
        issues.append(f"Memory at {memory_percent:.1f}%")
    if disk_percent >= 90:
        issues.append(f"Disk at {disk_percent:.1f}%")

    # Prefer health-check status when enabled checks exist.
    enabled_checks_result = await db.execute(
        select(HealthCheck).where(
            HealthCheck.server_id == server.id,
            HealthCheck.enabled.is_(True),
        )
    )
    enabled_checks = enabled_checks_result.scalars().all()

    if enabled_checks:
        server.status = worst_status([item.last_status for item in enabled_checks])
        if issues and server.status == ServerStatus.HEALTHY:
            server.status = ServerStatus.DEGRADED
            server.last_error = ", ".join(issues)
        elif issues:
            server.last_error = ", ".join(issues)
        elif server.status == ServerStatus.HEALTHY:
            server.last_error = None
    elif issues:
        server.status = ServerStatus.DEGRADED if cpu_percent < 98 and memory_percent < 98 else ServerStatus.DOWN
        server.last_error = ", ".join(issues)
    else:
        server.status = ServerStatus.HEALTHY
        server.last_error = None

    server.last_checked_at = datetime.utcnow()

    if previous_status not in {ServerStatus.DOWN, ServerStatus.DEGRADED} and server.status != ServerStatus.HEALTHY:
        title = f"[ALERT] {server.name} resource warning"
        message = f"Server `{server.name}`: {server.last_error}"
        if server.last_log_excerpt:
            message += f"\n\nRecent logs:\n{server.last_log_excerpt}"
        await record_incident(db, server, title, message, severity="warning")
        await notify_all(db, title, message)
    elif previous_status != ServerStatus.HEALTHY and server.status == ServerStatus.HEALTHY:
        await resolve_open_incidents(db, server.id)
        await notify_all(db, f"[RECOVERED] {server.name}", f"Server `{server.name}` metrics are normal.")

    await db.commit()
    return server


async def check_agent_heartbeats(db: AsyncSession, timeout_seconds: int) -> None:
    """
    If a server has an agent token but no enabled health checks, mark it DOWN
    when heartbeats stop arriving for too long.
    """
    cutoff = datetime.utcnow() - timedelta(seconds=timeout_seconds)

    servers_result = await db.execute(
        select(Server).where(Server.agent_token.is_not(None))
    )
    servers = servers_result.scalars().all()

    for server in servers:
        # If we already have active external checks, rely on them.
        enabled_checks_result = await db.execute(
            select(func.count())
            .select_from(HealthCheck)
            .where(
                HealthCheck.server_id == server.id,
                HealthCheck.enabled.is_(True),
            )
        )
        enabled_checks_count = enabled_checks_result.scalar_one()
        if enabled_checks_count > 0:
            continue

        last = server.last_checked_at
        if last is not None and last >= cutoff:
            continue

        age_seconds = (
            (datetime.utcnow() - last).total_seconds() if last is not None else timeout_seconds
        )

        if server.status != ServerStatus.DOWN:
            server.status = ServerStatus.DOWN
            server.last_error = f"No agent heartbeat for {age_seconds:.0f}s"

            title = f"[DOWN] {server.name} ({server.environment})"
            message = (
                f"Server `{server.name}` did not report metrics for {age_seconds:.0f} seconds.\n"
                f"Host: {server.host}\n"
                f"Reason: agent heartbeat timeout"
            )
            await record_incident(db, server, title, message)
            await notify_all(db, title, message)

    await db.commit()


def generate_agent_token() -> str:
    return secrets.token_urlsafe(24)


async def get_dashboard_stats(db: AsyncSession) -> dict:
    servers_result = await db.execute(select(Server))
    servers = servers_result.scalars().all()
    incidents_result = await db.execute(
        select(func.count()).select_from(Incident).where(Incident.resolved.is_(False))
    )
    open_incidents = incidents_result.scalar_one()

    counts = {status: 0 for status in ServerStatus}
    for server in servers:
        counts[server.status] += 1

    return {
        "total_servers": len(servers),
        "healthy": counts[ServerStatus.HEALTHY],
        "degraded": counts[ServerStatus.DEGRADED],
        "down": counts[ServerStatus.DOWN],
        "unknown": counts[ServerStatus.UNKNOWN],
        "open_incidents": open_incidents,
    }
