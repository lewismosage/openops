"""Deterministic issue detection for OpenOps servers."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import HealthCheck, Incident, Issue, Server, ServerMetric, ServerStatus
from app.services.monitor import notify_all as _notify_all


async def notify_all(db: AsyncSession, title: str, message: str) -> None:
    await _notify_all(db, title, message)

SLOW_CHECK_MS = 2000.0


@dataclass
class DetectedIssue:
    code: str
    severity: str
    title: str
    message: str


async def _latest_metric(db: AsyncSession, server_id: int) -> ServerMetric | None:
    result = await db.execute(
        select(ServerMetric)
        .where(ServerMetric.server_id == server_id)
        .order_by(ServerMetric.recorded_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _detect_for_server(db: AsyncSession, server: Server) -> list[DetectedIssue]:
    detected: list[DetectedIssue] = []

    checks_result = await db.execute(
        select(HealthCheck).where(
            HealthCheck.server_id == server.id,
            HealthCheck.enabled.is_(True),
        )
    )
    checks = list(checks_result.scalars().all())

    open_incidents = await db.execute(
        select(func.count())
        .select_from(Incident)
        .where(Incident.server_id == server.id, Incident.resolved.is_(False))
    )
    open_count = open_incidents.scalar_one()

    if server.status == ServerStatus.DOWN or open_count > 0:
        detected.append(
            DetectedIssue(
                code="server_down",
                severity="critical",
                title="Server is down or has an open incident",
                message=(
                    f"`{server.name}` is {server.status.value}. "
                    f"{server.last_error or 'An open incident still needs attention.'}"
                ),
            )
        )

    if not checks:
        detected.append(
            DetectedIssue(
                code="no_health_checks",
                severity="warning",
                title="No health checks configured",
                message=(
                    f"`{server.name}` has no enabled health checks. "
                    "Add an HTTP/TCP/ping check so OpenOps can verify availability."
                ),
            )
        )

    for check in checks:
        if check.last_response_ms is not None and check.last_response_ms >= SLOW_CHECK_MS:
            detected.append(
                DetectedIssue(
                    code=f"slow_check_{check.id}",
                    severity="warning",
                    title=f"Slow check: {check.name}",
                    message=(
                        f"Check `{check.name}` last responded in {check.last_response_ms:.0f}ms "
                        f"(threshold {SLOW_CHECK_MS:.0f}ms). Target: {check.target}"
                    ),
                )
            )
        elif check.last_status in {ServerStatus.DOWN, ServerStatus.DEGRADED}:
            detected.append(
                DetectedIssue(
                    code=f"check_failing_{check.id}",
                    severity="critical" if check.last_status == ServerStatus.DOWN else "warning",
                    title=f"Check failing: {check.name}",
                    message=(
                        f"Check `{check.name}` is {check.last_status.value}. "
                        f"{check.last_error or 'Health check failed.'}"
                    ),
                )
            )

    # Agent-only stale heartbeat
    if server.agent_token and not checks:
        timeout = settings.agent_heartbeat_timeout_seconds
        stale = False
        if server.last_checked_at is None:
            if server.created_at <= datetime.utcnow() - timedelta(seconds=timeout):
                stale = True
        elif server.last_checked_at < datetime.utcnow() - timedelta(seconds=timeout):
            stale = True
        if stale:
            detected.append(
                DetectedIssue(
                    code="agent_heartbeat_stale",
                    severity="critical",
                    title="Agent heartbeat missing",
                    message=(
                        f"`{server.name}` has not reported agent metrics within {timeout}s. "
                        "Install/start the agent or add HTTP health checks."
                    ),
                )
            )

    metric = await _latest_metric(db, server.id)
    if metric:
        resources = []
        if metric.cpu_percent is not None and metric.cpu_percent >= 90:
            resources.append(f"CPU {metric.cpu_percent:.0f}%")
        if metric.memory_percent is not None and metric.memory_percent >= 90:
            resources.append(f"RAM {metric.memory_percent:.0f}%")
        if metric.disk_percent is not None and metric.disk_percent >= 90:
            resources.append(f"Disk {metric.disk_percent:.0f}%")
        if resources:
            detected.append(
                DetectedIssue(
                    code="resource_pressure",
                    severity="warning",
                    title="High resource usage",
                    message=f"`{server.name}` resource pressure: {', '.join(resources)}.",
                )
            )

    return detected


async def evaluate_server_issues(db: AsyncSession, server_id: int) -> None:
    server_result = await db.execute(select(Server).where(Server.id == server_id))
    server = server_result.scalar_one_or_none()
    if not server:
        return

    detected = await _detect_for_server(db, server)
    detected_codes = {item.code for item in detected}

    open_result = await db.execute(
        select(Issue).where(Issue.server_id == server_id, Issue.resolved.is_(False))
    )
    open_issues = list(open_result.scalars().all())
    open_by_code = {issue.code: issue for issue in open_issues}

    # Auto-resolve cleared conditions
    for issue in open_issues:
        if issue.code not in detected_codes:
            issue.resolved = True
            issue.resolved_at = datetime.utcnow()

    # Open or refresh active issues; notify only on brand-new codes
    for item in detected:
        existing = open_by_code.get(item.code)
        if existing:
            existing.title = item.title
            existing.message = item.message
            existing.severity = item.severity
            continue

        # Re-open previously resolved issue with same code, or create new
        prior = await db.execute(
            select(Issue)
            .where(Issue.server_id == server_id, Issue.code == item.code)
            .order_by(Issue.created_at.desc())
            .limit(1)
        )
        prior_issue = prior.scalar_one_or_none()
        if prior_issue and prior_issue.resolved:
            prior_issue.resolved = False
            prior_issue.resolved_at = None
            prior_issue.title = item.title
            prior_issue.message = item.message
            prior_issue.severity = item.severity
            prior_issue.created_at = datetime.utcnow()
            new_issue = prior_issue
        else:
            new_issue = Issue(
                server_id=server_id,
                code=item.code,
                severity=item.severity,
                title=item.title,
                message=item.message,
            )
            db.add(new_issue)

        await db.flush()
        await notify_all(
            db,
            f"[{item.severity.upper()}] {server.name}: {item.title}",
            f"{item.message}\n\nCode: `{item.code}`\nHost: {server.host}",
        )

    await db.commit()


async def evaluate_all_issues(db: AsyncSession) -> None:
    result = await db.execute(select(Server))
    for server in result.scalars().all():
        await evaluate_server_issues(db, server.id)


async def count_open_issues(db: AsyncSession, server_id: int | None = None) -> int:
    stmt = select(func.count()).select_from(Issue).where(Issue.resolved.is_(False))
    if server_id is not None:
        stmt = stmt.where(Issue.server_id == server_id)
    result = await db.execute(stmt)
    return result.scalar_one()
