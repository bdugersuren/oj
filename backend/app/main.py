from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.services.achievement_engine import initialize_achievements
from app.services.worlds_seed import initialize_worlds_and_stages
from app.services.storage import storage_client
from app.core.session import CSRF_COOKIE
import anyio
from sqlalchemy import text

@asynccontextmanager
async def lifespan(app: FastAPI):
    # External I/O belongs to application startup, not module import. This keeps
    # CLI tools and unit-test collection deterministic while still failing
    # startup if required object storage is unavailable.
    await anyio.to_thread.run_sync(storage_client.initialize_buckets)

    # Startup: seed achievements and worlds data
    async with AsyncSessionLocal() as db:
        await initialize_achievements(db)
        await initialize_worlds_and_stages(db)
    yield
    # Shutdown logic (if any)

app = FastAPI(
    title="OJ Platform REST API",
    description="Next-Gen Olympiad & Competitive Programming Platform Core API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def csrf_protection(request: Request, call_next):
    """Require a double-submit token for browser state-changing requests."""
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.url.path not in {
        f"{settings.API_V1_STR}/auth/login", f"{settings.API_V1_STR}/auth/register"
    }:
        origin = request.headers.get("origin")
        allowed = {origin.strip() for origin in settings.CORS_ORIGINS.split(",")}
        # Same-origin browser requests commonly send the public platform origin.
        if origin and origin not in allowed and origin != f"https://{request.headers.get('host')}" and origin != f"http://{request.headers.get('host')}":
            return JSONResponse(status_code=403, content={"detail": "Зөвшөөрөгдөөгүй origin."})
        csrf_cookie = request.cookies.get(CSRF_COOKIE)
        if not csrf_cookie or request.headers.get("x-csrf-token") != csrf_cookie:
            return JSONResponse(status_code=403, content={"detail": "CSRF шалгалт амжилтгүй."})
    return await call_next(request)

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/health/live")
@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "oj-backend",
        "phase": 1,
        "ai_enabled": False,
    }


@app.get("/health/ready")
async def readiness_check():
    """Verify required dependencies without exposing credentials or topology."""
    checks = {"postgres": False, "redis": False, "minio": False}
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        checks["postgres"] = True
    except Exception:
        pass
    try:
        from redis.asyncio import Redis

        redis_client = Redis.from_url(settings.REDIS_URL)
        try:
            checks["redis"] = bool(await redis_client.ping())
        finally:
            await redis_client.aclose()
    except Exception:
        pass
    try:
        checks["minio"] = await anyio.to_thread.run_sync(
            storage_client.client.bucket_exists,
            settings.MINIO_BUCKET_PROBLEMS,
        )
    except Exception:
        pass
    ready = all(checks.values())
    return JSONResponse(
        status_code=200 if ready else 503,
        content={"status": "ready" if ready else "not_ready", "checks": checks},
    )

@app.get("/api/v1")
async def root_v1():
    return {
        "message": "Welcome to OJ Platform API v1",
        "endpoints": {
            "auth": "/api/v1/auth",
            "problems": "/api/v1/problems",
            "submissions": "/api/v1/submissions",
            "progression": "/api/v1/progress",
            "analytics": "/api/v1/analytics",
            "tickets": "/api/v1/tickets",
        }
    }
