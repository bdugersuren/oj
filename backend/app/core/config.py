from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

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
    DMOJ_BRIDGE_PORT: int = 9999
    DMOJ_JUDGE_KEY: str = "dmoj_judge_auth_secret_key_2026"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
