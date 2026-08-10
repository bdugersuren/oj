import secrets
from datetime import datetime, timedelta
from typing import Any, Optional, Union

import bcrypt
from jose import jwt, JWTError

from app.core.config import settings

ALGORITHM = "HS256"
REFRESH_TOKEN_EXPIRE_DAYS = 7


# ─── Password Hashing ────────────────────────────────────────────────────────

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """bcrypt-ээр нууц үгийг шалгах"""
    return bcrypt.checkpw(
        plain_password.encode("utf-8")[:72],
        hashed_password.encode("utf-8"),
    )


def get_password_hash(password: str) -> str:
    """bcrypt-ээр нууц үгийг hash болгох"""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8")[:72], salt).decode("utf-8")


# ─── JWT Access Token ─────────────────────────────────────────────────────────

def create_access_token(
    subject: Union[str, Any],
    role: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    15 минутын нэвтрэх JWT токен үүсгэх.
    Payload: sub (user_id), role, exp
    """
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode = {
        "sub":  str(subject),
        "role": role,
        "exp":  expire,
        "type": "access",
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """
    JWT токен задлах. Хүчингүй эсвэл хугацаа дууссан бол JWTError өсгөнө.
    """
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])


# ─── Refresh Token ────────────────────────────────────────────────────────────

def generate_refresh_token() -> str:
    """
    Cryptographically secure random refresh token.
    DB-д хадгалж, client-д cookie эсвэл response body-д илгээнэ.
    """
    return secrets.token_urlsafe(64)


def refresh_token_expires_at() -> datetime:
    """Refresh token 7 хоногийн дараа дуусна."""
    return datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
