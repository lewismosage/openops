"""Server latency/uptime insights from check result history."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CheckResult, ServerStatus
from app.services.issues import count_open_issues


def _percentile(sorted_values: list[float], pct: float) -> float | None:
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = (len(sorted_values) - 1) * pct
    low = int(rank)
    high = min(low + 1, len(sorted_values) - 1)
    weight = rank - low
    return sorted_values[low] * (1 - weight) + sorted_values[high] * weight


async def _window_stats(db: AsyncSession, server_id: int, hours: int) -> tuple[float | None, float | None, float | None]:
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    result = await db.execute(
        select(CheckResult).where(
            CheckResult.server_id == server_id,
            CheckResult.checked_at >= cutoff,
        )
    )
    rows = list(result.scalars().all())
    if not rows:
        return None, None, None

    healthy = sum(1 for row in rows if row.status == ServerStatus.HEALTHY)
    uptime = (healthy / len(rows)) * 100.0
    latencies = sorted(row.response_ms for row in rows if row.response_ms is not None)
    avg = sum(latencies) / len(latencies) if latencies else None
    p95 = _percentile(latencies, 0.95)
    return uptime, avg, p95


async def get_server_insights(db: AsyncSession, server_id: int) -> dict:
    uptime_24h, avg_24h, p95_24h = await _window_stats(db, server_id, 24)
    uptime_7d, avg_7d, p95_7d = await _window_stats(db, server_id, 24 * 7)

    spark_result = await db.execute(
        select(CheckResult)
        .where(CheckResult.server_id == server_id)
        .order_by(CheckResult.checked_at.desc())
        .limit(40)
    )
    spark_rows = list(reversed(spark_result.scalars().all()))
    sparkline = [
        {
            "checked_at": row.checked_at,
            "response_ms": row.response_ms,
            "status": row.status.value if hasattr(row.status, "value") else str(row.status),
        }
        for row in spark_rows
    ]

    open_issues = await count_open_issues(db, server_id)

    return {
        "server_id": server_id,
        "uptime_24h": uptime_24h,
        "uptime_7d": uptime_7d,
        "avg_latency_ms": avg_24h if avg_24h is not None else avg_7d,
        "p95_latency_ms": p95_24h if p95_24h is not None else p95_7d,
        "open_issues": open_issues,
        "sparkline": sparkline,
    }


async def get_server_summary_metrics(db: AsyncSession, server_id: int) -> tuple[float | None, float | None, int]:
    uptime_24h, avg_latency, _ = await _window_stats(db, server_id, 24)
    open_issues = await count_open_issues(db, server_id)
    return uptime_24h, avg_latency, open_issues
