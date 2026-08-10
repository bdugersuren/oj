"""
FastAPI Dependency Injection utilities.

Usage in endpoint:
    @router.get("/me")
    async def get_me(current_user: User = Depends(get_current_user)):
        ...

    @router.post("/create")
    async def create(current_user: User = Depends(require_role("teacher", "admin"))):
        ...
"""
from typing import List
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.config import settings
from app.core.security import decode_token
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login", auto_error=False)


async def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Bearer token-ийг decode хийж DB-ээс хэрэглэгчийг буцаах.
    Хүчингүй token → 401 Unauthorized.
    Идэвхгүй хэрэглэгч → 403 Forbidden.
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Нэвтрэх токен хүчингүй эсвэл хугацаа дууссан байна.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token = token or request.cookies.get("oj_access")
    try:
        if not token:
            raise credentials_exc
        payload = decode_token(token)
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type", "access")

        if user_id is None or token_type != "access":
            raise credentials_exc

    except JWTError:
        raise credentials_exc

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exc
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Таны акаунт идэвхгүй болсон байна. Удирдагчтай холбогдоно уу.",
        )
    return user


def require_role(*allowed_roles: str):
    """
    Тодорхой эрхийн хязгаарлалт хийх dependency factory.

    Example:
        Depends(require_role("admin"))
        Depends(require_role("teacher", "admin"))
    """
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role.value not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Энэ үйлдлийг гүйцэтгэх эрх байхгүй байна. "
                    f"Шаардагдах эрх: {', '.join(allowed_roles)}. "
                    f"Таны эрх: {current_user.role.value}"
                ),
            )
        return current_user
    return role_checker


async def rate_limit_auth(request: Request):
    """
    IP-д суурилсан Redis sliding window rate limiter.
    Минут бүрт settings.RATE_LIMIT_LOGIN_PER_MIN-оос дээш хүсэлтийг хаана.
    """
    import time
    import redis.asyncio as aioredis
    
    # Хэрэглэгчийн IP хаягийг тодорхойлох
    ip = request.client.host if request.client else "unknown"
    key = f"rate_limit:auth:{ip}"
    
    now = time.time()
    window_start = now - 60  # 60 секундын цонх
    
    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        async with redis_client.pipeline(transaction=True) as pipe:
            # Цонхоос өмнөх хуучин бичлэгүүдийг устгах
            pipe.zremrangebyscore(key, 0, window_start)
            # Одоогийн хүсэлтийг нэмэх
            pipe.zadd(key, {str(now): now})
            # Одоогийн цонхонд байгаа нийт хүсэлтийн тоог авах
            pipe.zcard(key)
            # Түлхүүрийн хүчинтэй хугацааг шинэчлэх (1 минут)
            pipe.expire(key, 60)
            
            res = await pipe.execute()
            count = res[2]
            
            if count > settings.RATE_LIMIT_LOGIN_PER_MIN:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Хэтэрхий олон оролдлого хийлээ. Минут хүлээгээд дахин оролдоно уу.",
                )
    finally:
        await redis_client.close()

