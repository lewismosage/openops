from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import seed_admin_user
from app.config import settings
from app.database import SessionLocal, init_db
from app.routers import agent, api, auth
from app.services.scheduler import refresh_scheduler, start_scheduler


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    async with SessionLocal() as db:
        await seed_admin_user(db)
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

app.include_router(auth.router)
app.include_router(api.router)
app.include_router(agent.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "openops"}
