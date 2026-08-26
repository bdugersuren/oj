import os
from pathlib import Path
from typing import Optional

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


SECRET_FILE_SETTINGS = (
    "SECRET_KEY",
    "DATABASE_URL",
    "REDIS_URL",
    "MINIO_ROOT_USER",
    "MINIO_ROOT_PASSWORD",
    "DMOJ_JUDGE_KEY",
    "SMTP_PASSWORD",
)


def load_secret_file_settings() -> None:
    """Load Docker/Kubernetes-style ``SETTING_FILE`` values before Pydantic.

    The mounted file wins over values from ``.env``. Supplying the setting
    directly in the process environment as well is rejected so production
    credentials cannot silently remain exposed through container inspection.
    """
    for name in SECRET_FILE_SETTINGS:
        file_variable = f"{name}_FILE"
        file_name = os.environ.get(file_variable)
        if not file_name:
            continue
        if name in os.environ:
            raise ValueError(f"Set either {name} or {file_variable}, not both.")
        path = Path(file_name)
        try:
            value = path.read_text(encoding="utf-8").strip()
        except OSError as exc:
            raise ValueError(f"Unable to read secret file for {name}: {path}") from exc
        if not value:
            raise ValueError(f"Secret file for {name} is empty: {path}")
        os.environ[name] = value


load_secret_file_settings()

class Settings(BaseSettings):
    PROJECT_NAME: str = "OJ Platform API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    SECRET_KEY: str = "supersecretkey-generate-a-strong-one-for-production-12345"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15          # 15 минут (short-lived)
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7             # 7 хоног (long-lived, DB-д хадгалагдана)
    
    ENABLE_AI: bool = False
    ENVIRONMENT: str = "development"
    COOKIE_SECURE: bool = False
    COOKIE_DOMAIN: Optional[str] = None
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    
    TZ_NAME: str = "Asia/Ulaanbaatar"
    RATE_LIMIT_LOGIN_PER_MIN: int = 5

    # Email is explicit opt-in. Missing SMTP credentials must never create an
    # unverified account that cannot receive its verification message.
    SMTP_ENABLED: bool = False
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_TLS: bool = True
    EMAILS_FROM_EMAIL: Optional[str] = None
    EMAILS_FROM_NAME: str = "OJ Platform"
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://oj_user:oj_secure_password_2026@db:5432/oj_db"
    
    # Redis
    REDIS_URL: str = "redis://redis:6379/0"
    
    # MinIO
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_PUBLIC_URL: Optional[str] = None
    MINIO_ROOT_USER: str = "minioadmin"
    MINIO_ROOT_PASSWORD: str = "minioadmin_secure_2026"
    MINIO_BUCKET_PROBLEMS: str = "oj-problems"
    MINIO_BUCKET_SUBMISSIONS: str = "oj-submissions"
    MINIO_BUCKET_AVATARS: str = "oj-avatars"
    
    # DMOJ
    DMOJ_BRIDGE_HOST: str = "bridge"
    DMOJ_BRIDGE_HOSTS: str = "bridge1,bridge2"
    DMOJ_BRIDGE_PORT: int = 9999
    DMOJ_JUDGE_KEY: str = "dmoj_judge_auth_secret_key_2026"
    JUDGE_LEASE_SECONDS: int = 300

    @model_validator(mode="after")
    def reject_insecure_production_defaults(self):
        if self.ENVIRONMENT.lower() != "production":
            return self

        insecure_values = {
            "supersecretkey-generate-a-strong-one-for-production-12345",
            "oj_secure_password_2026",
            "minioadmin_secure_2026",
            "dmoj_judge_auth_secret_key_2026",
        }
        secret_values = {
            "SECRET_KEY": self.SECRET_KEY,
            "DATABASE_URL": self.DATABASE_URL,
            "MINIO_ROOT_PASSWORD": self.MINIO_ROOT_PASSWORD,
            "DMOJ_JUDGE_KEY": self.DMOJ_JUDGE_KEY,
        }
        invalid = [
            name
            for name, value in secret_values.items()
            if not value
            or any(default in value for default in insecure_values)
            or "change-me" in value.lower()
        ]
        if invalid:
            raise ValueError(
                "Production secrets must be explicitly replaced: " + ", ".join(invalid)
            )
        if not self.COOKIE_SECURE:
            raise ValueError("COOKIE_SECURE must be true in production.")
        if self.SMTP_ENABLED and not all(
            (
                self.SMTP_HOST,
                self.SMTP_USER,
                self.SMTP_PASSWORD,
                self.EMAILS_FROM_EMAIL,
            )
        ):
            raise ValueError(
                "SMTP_ENABLED requires SMTP_HOST, SMTP_USER, SMTP_PASSWORD, "
                "and EMAILS_FROM_EMAIL in production."
            )
        if self.JUDGE_LEASE_SECONDS < 60:
            raise ValueError("JUDGE_LEASE_SECONDS must be at least 60 in production.")
        origins = {item.strip() for item in self.CORS_ORIGINS.split(",") if item.strip()}
        if not origins or any(
            not item.startswith("https://") or "localhost" in item or "127.0.0.1" in item
            for item in origins
        ):
            raise ValueError("Production CORS_ORIGINS must contain only explicit HTTPS origins.")
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
