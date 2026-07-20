from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import HealthCheck, Incident, Notification, Server
from app.schemas import (
    DashboardStats,
    HealthCheckCreate,
    HealthCheckResponse,
    IncidentResponse,
    NotificationCreate,
    NotificationResponse,
    ServerCreate,
    ServerResponse,
    ServerUpdate,
)
from app.services.monitor import generate_agent_token, get_dashboard_stats
from app.services.scheduler import refresh_scheduler

router = APIRouter(prefix="/api", tags=["api"])


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard(db: AsyncSession = Depends(get_db)):
    return await get_dashboard_stats(db)


@router.get("/servers", response_model=list[ServerResponse])
async def list_servers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Server).order_by(Server.name))
    return result.scalars().all()


@router.post("/servers", response_model=ServerResponse)
async def create_server(payload: ServerCreate, db: AsyncSession = Depends(get_db)):
    server = Server(**payload.model_dump(), agent_token=generate_agent_token())
    db.add(server)
    await db.commit()
    await db.refresh(server)
    return server


@router.get("/servers/{server_id}", response_model=ServerResponse)
async def get_server(server_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return server


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
    return server


@router.delete("/servers/{server_id}")
async def delete_server(server_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    await db.delete(server)
    await db.commit()
    return {"ok": True}


@router.get("/servers/{server_id}/checks", response_model=list[HealthCheckResponse])
async def list_checks(server_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(HealthCheck).where(HealthCheck.server_id == server_id))
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


@router.get("/incidents", response_model=list[IncidentResponse])
async def list_incidents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Incident).order_by(Incident.started_at.desc()).limit(50))
    return result.scalars().all()
