from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import agent, api
from app.services.scheduler import refresh_scheduler, start_scheduler


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    start_scheduler()
    await refresh_scheduler()
    yield


app = FastAPI(title="OpenOps", description="Developer server monitoring platform", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api.router)
app.include_router(agent.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "openops"}
