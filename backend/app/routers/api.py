from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import HealthCheck, Incident, Notification, Server, ServerMetric
from app.schemas import (
    DashboardStats,
    HealthCheckCreate,
    HealthCheckResponse,
    HealthCheckUpdate,
    IncidentResponse,
    MetricResponse,
    NotificationCreate,
    NotificationResponse,
    NotificationUpdate,
    ServerCreate,
    ServerResponse,
    ServerUpdate,
)
from app.services.monitor import generate_agent_token, get_dashboard_stats
from app.services.scheduler import refresh_scheduler
from datetime import datetime

router = APIRouter(prefix="/api", tags=["api"])


async def _server_response(db: AsyncSession, server: Server) -> ServerResponse:
    checks_result = await db.execute(
        select(HealthCheck).where(HealthCheck.server_id == server.id).order_by(HealthCheck.name)
    )
    checks = checks_result.scalars().all()
    metric_result = await db.execute(
        select(ServerMetric)
        .where(ServerMetric.server_id == server.id)
        .order_by(ServerMetric.recorded_at.desc())
        .limit(1)
    )
    latest_metric = metric_result.scalar_one_or_none()
    return ServerResponse(
        id=server.id,
        name=server.name,
        host=server.host,
        environment=server.environment,
        description=server.description,
        status=server.status,
        last_checked_at=server.last_checked_at,
        last_error=server.last_error,
        last_log_excerpt=server.last_log_excerpt,
        agent_token=server.agent_token,
        created_at=server.created_at,
        latest_metric=MetricResponse.model_validate(latest_metric) if latest_metric else None,
        checks=[HealthCheckResponse.model_validate(check) for check in checks],
    )


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard(db: AsyncSession = Depends(get_db)):
    return await get_dashboard_stats(db)


@router.get("/servers", response_model=list[ServerResponse])
async def list_servers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Server).order_by(Server.name))
    servers = result.scalars().all()
    return [await _server_response(db, server) for server in servers]


@router.post("/servers", response_model=ServerResponse)
async def create_server(payload: ServerCreate, db: AsyncSession = Depends(get_db)):
    server = Server(**payload.model_dump(), agent_token=generate_agent_token())
    db.add(server)
    await db.commit()
    await db.refresh(server)
    return await _server_response(db, server)


@router.get("/servers/{server_id}", response_model=ServerResponse)
async def get_server(server_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return await _server_response(db, server)


@router.patch("/servers/{server_id}", response_model=ServerResponse)
async def update_server(
    server_id: int,
    payload: ServerUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(server, key, value)
    await db.commit()
    await db.refresh(server)
    return await _server_response(db, server)


@router.delete("/servers/{server_id}")
async def delete_server(server_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    await db.delete(server)
    await db.commit()
    await refresh_scheduler()
    return {"ok": True}


@router.get("/servers/{server_id}/metrics", response_model=list[MetricResponse])
async def list_metrics(server_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ServerMetric)
        .where(ServerMetric.server_id == server_id)
        .order_by(ServerMetric.recorded_at.desc())
        .limit(50)
    )
    return result.scalars().all()


@router.get("/servers/{server_id}/checks", response_model=list[HealthCheckResponse])
async def list_checks(server_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(HealthCheck).where(HealthCheck.server_id == server_id).order_by(HealthCheck.name)
    )
    return result.scalars().all()


@router.post("/servers/{server_id}/checks", response_model=HealthCheckResponse)
async def create_check(
    server_id: int,
    payload: HealthCheckCreate,
    db: AsyncSession = Depends(get_db),
):
    server_result = await db.execute(select(Server).where(Server.id == server_id))
    if not server_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Server not found")

    check = HealthCheck(server_id=server_id, **payload.model_dump())
    db.add(check)
    await db.commit()
    await db.refresh(check)
    await refresh_scheduler()
    return check


@router.patch("/checks/{check_id}", response_model=HealthCheckResponse)
async def update_check(
    check_id: int,
    payload: HealthCheckUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(HealthCheck).where(HealthCheck.id == check_id))
    check = result.scalar_one_or_none()
    if not check:
        raise HTTPException(status_code=404, detail="Health check not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(check, key, value)
    await db.commit()
    await db.refresh(check)
    await refresh_scheduler()
    return check


@router.delete("/checks/{check_id}")
async def delete_check(check_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(HealthCheck).where(HealthCheck.id == check_id))
    check = result.scalar_one_or_none()
    if not check:
        raise HTTPException(status_code=404, detail="Health check not found")
    await db.delete(check)
    await db.commit()
    await refresh_scheduler()
    return {"ok": True}


@router.get("/notifications", response_model=list[NotificationResponse])
async def list_notifications(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Notification).order_by(Notification.name))
    return result.scalars().all()


@router.post("/notifications", response_model=NotificationResponse)
async def create_notification(payload: NotificationCreate, db: AsyncSession = Depends(get_db)):
    notification = Notification(**payload.model_dump())
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    return notification


@router.patch("/notifications/{notification_id}", response_model=NotificationResponse)
async def update_notification(
    notification_id: int,
    payload: NotificationUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Notification).where(Notification.id == notification_id))
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(notification, key, value)
    await db.commit()
    await db.refresh(notification)
    return notification


@router.delete("/notifications/{notification_id}")
async def delete_notification(notification_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Notification).where(Notification.id == notification_id))
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    await db.delete(notification)
    await db.commit()
    return {"ok": True}


@router.get("/incidents", response_model=list[IncidentResponse])
async def list_incidents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Incident, Server.name)
        .join(Server, Server.id == Incident.server_id)
        .order_by(Incident.started_at.desc())
        .limit(50)
    )
    incidents: list[IncidentResponse] = []
    for incident, server_name in result.all():
        payload = IncidentResponse.model_validate(incident)
        payload.server_name = server_name
        incidents.append(payload)
    return incidents


@router.post("/incidents/{incident_id}/resolve", response_model=IncidentResponse)
async def resolve_incident(incident_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Incident, Server.name)
        .join(Server, Server.id == Incident.server_id)
        .where(Incident.id == incident_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Incident not found")
    incident, server_name = row
    incident.resolved = True
    incident.resolved_at = datetime.utcnow()
    await db.commit()
    await db.refresh(incident)
    payload = IncidentResponse.model_validate(incident)
    payload.server_name = server_name
    return payload
