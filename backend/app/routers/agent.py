from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import AgentHeartbeat, ServerResponse
from app.services.monitor import process_agent_heartbeat

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.post("/heartbeat", response_model=ServerResponse)
async def agent_heartbeat(payload: AgentHeartbeat, token: str, db: AsyncSession = Depends(get_db)):
    server = await process_agent_heartbeat(
        db,
        token,
        payload.cpu_percent,
        payload.memory_percent,
        payload.disk_percent,
        payload.load_avg,
        payload.log_excerpt,
    )
    if not server:
        raise HTTPException(status_code=401, detail="Invalid agent token")
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
        latest_metric=None,
        checks=[],
    )
