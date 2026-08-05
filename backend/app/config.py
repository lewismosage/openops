from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./openops.db"
    check_interval_seconds: int = 30
    agent_heartbeat_timeout_seconds: int = 90
    agent_stale_check_interval_seconds: int = 30
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3001,http://127.0.0.1:3001,"
        "http://localhost:3002,http://127.0.0.1:3002"
    )
    jwt_secret: str = "openops-dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    # Accord-like session policy (enforced mainly on the client; refresh respects absolute window)
    inactivity_timeout_minutes: int = 60
    absolute_timeout_hours: int = 24
    seed_admin_email: str = "maendalewis20@gmail.com"
    seed_admin_password: str = "@Lewis9590"
    seed_admin_name: str = "Lewis"
    frontend_url: str = "http://localhost:3000"
    password_reset_expire_minutes: int = 60
    # When true (local/dev), forgot-password responses include the reset URL.
    # Turn off once real email delivery is configured.
    expose_password_reset_links: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
