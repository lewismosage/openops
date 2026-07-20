from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from app.database import SessionLocal
from app.config import settings
from app.models import HealthCheck
from app.services.monitor import check_agent_heartbeats, run_health_check

scheduler = AsyncIOScheduler()


async def schedule_all_checks() -> None:
    async with SessionLocal() as db:
        result = await db.execute(select(HealthCheck).where(HealthCheck.enabled.is_(True)))
        checks = result.scalars().all()

    for check in checks:
        job_id = f"check-{check.id}"
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
        scheduler.add_job(
            _run_check_job,
            "interval",
            seconds=max(check.interval_seconds, 15),
            id=job_id,
            args=[check.id],
            replace_existing=True,
        )

    agent_stale_job_id = "agent-stale-checks"
    if scheduler.get_job(agent_stale_job_id):
        scheduler.remove_job(agent_stale_job_id)
    scheduler.add_job(
        _run_agent_stale_job,
        "interval",
        seconds=max(settings.agent_stale_check_interval_seconds, 10),
        id=agent_stale_job_id,
        replace_existing=True,
    )


async def _run_check_job(check_id: int) -> None:
    async with SessionLocal() as db:
        await run_health_check(db, check_id)


async def _run_agent_stale_job() -> None:
    async with SessionLocal() as db:
        await check_agent_heartbeats(
            db,
            timeout_seconds=settings.agent_heartbeat_timeout_seconds,
        )


def start_scheduler() -> None:
    if not scheduler.running:
        scheduler.start()


async def refresh_scheduler() -> None:
    await schedule_all_checks()

