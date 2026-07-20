from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./openops.db"
    check_interval_seconds: int = 30
    agent_heartbeat_timeout_seconds: int = 90
    agent_stale_check_interval_seconds: int = 30
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000"

    class Config:
        env_file = ".env"


settings = Settings()
