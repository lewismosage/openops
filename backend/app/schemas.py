from datetime import datetime

from pydantic import BaseModel, Field

from app.models import CheckType, NotificationChannel, ServerStatus


class ServerCreate(BaseModel):
    name: str
    host: str
    environment: str = "production"
    description: str | None = None


class ServerUpdate(BaseModel):
    name: str | None = None
    host: str | None = None
    environment: str | None = None
    description: str | None = None


class MetricResponse(BaseModel):
    id: int
    server_id: int
    cpu_percent: float | None
    memory_percent: float | None
    disk_percent: float | None
    load_avg: float | None
    recorded_at: datetime

    model_config = {"from_attributes": True}


class HealthCheckCreate(BaseModel):
    name: str
    check_type: CheckType
    target: str
    interval_seconds: int = 30
    timeout_seconds: int = 10
    expected_status: int | None = 200
    enabled: bool = True


class HealthCheckUpdate(BaseModel):
    name: str | None = None
    check_type: CheckType | None = None
    target: str | None = None
    interval_seconds: int | None = None
    timeout_seconds: int | None = None
    expected_status: int | None = None
    enabled: bool | None = None


class HealthCheckResponse(BaseModel):
    id: int
    server_id: int
    name: str
    check_type: CheckType
    target: str
    interval_seconds: int
    timeout_seconds: int
    expected_status: int | None
    enabled: bool
    last_status: ServerStatus
    last_response_ms: float | None
    last_error: str | None
    last_checked_at: datetime | None

    model_config = {"from_attributes": True}


class ServerResponse(BaseModel):
    id: int
    name: str
    host: str
    environment: str
    description: str | None
    status: ServerStatus
    last_checked_at: datetime | None
    last_error: str | None
    last_log_excerpt: str | None = None
    agent_token: str | None
    created_at: datetime
    latest_metric: MetricResponse | None = None
    checks: list[HealthCheckResponse] = []

    model_config = {"from_attributes": True}


class NotificationCreate(BaseModel):
    name: str
    channel: NotificationChannel
    config_json: str
    enabled: bool = True


class NotificationUpdate(BaseModel):
    name: str | None = None
    config_json: str | None = None
    enabled: bool | None = None


class NotificationResponse(BaseModel):
    id: int
    name: str
    channel: NotificationChannel
    config_json: str
    enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class IncidentResponse(BaseModel):
    id: int
    server_id: int
    server_name: str | None = None
    title: str
    message: str
    log_excerpt: str | None = None
    severity: str
    resolved: bool
    started_at: datetime
    resolved_at: datetime | None

    model_config = {"from_attributes": True}


class AgentHeartbeat(BaseModel):
    cpu_percent: float = Field(ge=0, le=100)
    memory_percent: float = Field(ge=0, le=100)
    disk_percent: float = Field(ge=0, le=100)
    load_avg: float | None = None
    log_excerpt: str | None = None


class DashboardStats(BaseModel):
    total_servers: int
    healthy: int
    degraded: int
    down: int
    unknown: int
    open_incidents: int
