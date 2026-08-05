from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, echo=False)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def _ensure_columns(conn) -> None:
    """SQLite-friendly additive migrations for existing MVP databases."""
    alterations = [
        ("servers", "last_log_excerpt", "TEXT"),
        ("servers", "user_id", "INTEGER"),
        ("incidents", "log_excerpt", "TEXT"),
        ("notifications", "user_id", "INTEGER"),
        ("users", "reset_token_hash", "VARCHAR(128)"),
        ("users", "reset_token_expires_at", "DATETIME"),
        ("issues", "last_notified_at", "DATETIME"),
    ]
    for table, column, column_type in alterations:
        result = await conn.execute(text(f"PRAGMA table_info({table})"))
        columns = {row[1] for row in result.fetchall()}
        if column not in columns:
            await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}"))


async def _normalize_data(conn) -> None:
    """Fix legacy enum/string values from earlier schema versions."""
    await conn.execute(
        text("UPDATE notifications SET channel = 'email' WHERE channel IN ('EMAIL', 'email')")
    )


async def init_db() -> None:
    # Import models so metadata includes all tables before create_all.
    from app import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _ensure_columns(conn)
        await _normalize_data(conn)
