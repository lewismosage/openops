import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ServerStatus(str, enum.Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"
    UNKNOWN = "unknown"


class CheckType(str, enum.Enum):
    HTTP = "http"
    TCP = "tcp"
    PING = "ping"
    AGENT = "agent"


class NotificationChannel(str, enum.Enum):
    DISCORD = "discord"
    TELEGRAM = "telegram"
    WEBHOOK = "webhook"
    EMAIL = "email"


class Server(Base):
    __tablename__ = "servers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    host: Mapped[str] = mapped_column(String(255))
    environment: Mapped[str] = mapped_column(String(50), default="production")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ServerStatus] = mapped_column(
        Enum(ServerStatus), default=ServerStatus.UNKNOWN
    )
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_log_excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent_token: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    checks: Mapped[list["HealthCheck"]] = relationship(
        back_populates="server", cascade="all, delete-orphan"
    )
    metrics: Mapped[list["ServerMetric"]] = relationship(
        back_populates="server", cascade="all, delete-orphan"
    )
    incidents: Mapped[list["Incident"]] = relationship(
        back_populates="server", cascade="all, delete-orphan"
    )


class HealthCheck(Base):
    __tablename__ = "health_checks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    server_id: Mapped[int] = mapped_column(ForeignKey("servers.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    check_type: Mapped[CheckType] = mapped_column(Enum(CheckType))
    target: Mapped[str] = mapped_column(String(500))
    interval_seconds: Mapped[int] = mapped_column(Integer, default=30)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=10)
    expected_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_status: Mapped[ServerStatus] = mapped_column(
        Enum(ServerStatus), default=ServerStatus.UNKNOWN
    )
    last_response_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    server: Mapped["Server"] = relationship(back_populates="checks")


class ServerMetric(Base):
    __tablename__ = "server_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    server_id: Mapped[int] = mapped_column(ForeignKey("servers.id", ondelete="CASCADE"))
    cpu_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    memory_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    disk_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    load_avg: Mapped[float | None] = mapped_column(Float, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    server: Mapped["Server"] = relationship(back_populates="metrics")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    channel: Mapped[NotificationChannel] = mapped_column(Enum(NotificationChannel))
    config_json: Mapped[str] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    server_id: Mapped[int] = mapped_column(ForeignKey("servers.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text)
    log_excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), default="critical")
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    server: Mapped["Server"] = relationship(back_populates="incidents")
