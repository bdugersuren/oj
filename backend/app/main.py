from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.services.achievement_engine import initialize_achievements
from app.services.worlds_seed import initialize_worlds_and_stages
from app.core.session import CSRF_COOKIE

@asynccontextmanager
async def lifespan(app: FastAPI):
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

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "oj-backend",
        "phase": 1,
        "ai_enabled": False,
    }

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
