"""
Authentication API Endpoints
POST /api/v1/auth/register  — Шинэ хэрэглэгч бүртгэх
POST /api/v1/auth/login     — Нэвтрэх → access_token + refresh_token
POST /api/v1/auth/refresh   — Refresh token-ээр шинэ access_token авах
POST /api/v1/auth/logout    — Refresh token устгах (revoke)
GET  /api/v1/auth/me        — Одоогийн хэрэглэгчийн мэдээлэл
PATCH /api/v1/auth/me       — Профайл шинэчлэх (нэр, сургууль, анги)
"""
from datetime import datetime, timedelta
import secrets
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr, field_validator

from app.core.database import get_db
from app.core.config import settings
from app.core.security import (
    verify_password, get_password_hash,
    create_access_token, decode_token,
    generate_refresh_token, refresh_token_expires_at,
)
from app.core.dependencies import get_current_user, rate_limit_auth
from app.models.user import User, UserRole, RefreshToken
from app.models.progression import StudentProgress
from app.models.progression import StudentLevel
from app.models.verification_token import VerificationToken
from app.core.session import set_session_cookies, clear_session_cookies, REFRESH_COOKIE
from app.services.email import (
    send_verification_email,
    send_password_reset_email,
    get_smtp_config,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class UserRegisterIn(BaseModel):
    username:   str
    email:      EmailStr
    password:   str
    full_name:  Optional[str] = None
    school:     Optional[str] = None
    grade:      Optional[str] = None
    role:       UserRole = UserRole.STUDENT

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Нууц үг наад зах нь 8 тэмдэгт байх ёстой.")
        return v

    @field_validator("username")
    @classmethod
    def username_format(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Хэрэглэгчийн нэр наад зах нь 3 тэмдэгт байх ёстой.")
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Хэрэглэгчийн нэр зөвхөн үсэг, тоо, '_', '-' агуулна.")
        return v.lower()


class RegisterResponse(BaseModel):
    message: str


class SessionResponse(BaseModel):
    expires_in:    int = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60  # seconds
    user: dict


class LoginIn(BaseModel):
    login: str
    password: str


class RefreshTokenIn(BaseModel):
    refresh_token: str


class ProfileUpdateIn(BaseModel):
    full_name:  Optional[str] = None
    school:     Optional[str] = None
    grade:      Optional[str] = None
    avatar_url: Optional[str] = None


class VerifyIn(BaseModel):
    token: str


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str


class PasswordUpdateIn(BaseModel):
    current_password: str
    new_password: str


# ─── Helper ───────────────────────────────────────────────────────────────────

def _user_dict(user: User) -> dict:
    return {
        "id":         str(user.id),
        "username":   user.username,
        "email":      user.email,
        "full_name":  user.full_name,
        "role":       user.role.value,
        "avatar_url": user.avatar_url,
        "school":     user.school,
        "grade":      user.grade,
        "is_active":  user.is_active,
        "is_verified": user.is_verified,
        "created_at": user.created_at.isoformat(),
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Шинэ хэрэглэгч бүртгэх (И-мэйл баталгаажуулалттай)",
    dependencies=[Depends(rate_limit_auth)],
)
async def register(
    user_in: UserRegisterIn,
    db: AsyncSession = Depends(get_db),
):
    if user_in.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Багш болон админы эрхийг зөвхөн админ олгоно.",
        )

    # Давхардал шалгах
    result = await db.execute(
        select(User).where(
            (User.username == user_in.username) | (User.email == user_in.email)
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Хэрэглэгчийн нэр эсвэл и-мэйл хаяг бүртгэлтэй байна.",
        )

    # SMTP идэвхтэй эсэхийг урьдчилан шалгах
    try:
        smtp_cfg = await get_smtp_config(db)
        smtp_enabled = smtp_cfg.get("enabled", False)
    except Exception:
        smtp_enabled = False

    # И-мэйл баталгаажуулалт шаардлагагүй тохиолдол:
    # - SMTP идэвхгүй байгаа
    # - Admin эсвэл Teacher role-тэй хэрэглэгч
    auto_verified = not smtp_enabled

    # Шинэ хэрэглэгч үүсгэх
    user = User(
        username=user_in.username,
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role,
        full_name=user_in.full_name,
        school=user_in.school,
        grade=user_in.grade,
        is_verified=auto_verified,
    )
    db.add(user)
    await db.flush()

    # Сурагчийн дэвшлийн бичлэг (зөвхөн student role-д)
    if user_in.role == UserRole.STUDENT:
        level_result = await db.execute(
            select(StudentLevel).where(StudentLevel.name == "Bronze")
        )
        bronze = level_result.scalar_one_or_none()
        if not bronze:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Сургалтын суурь түвшин бэлэн биш байна.",
            )
        progress = StudentProgress(user_id=user.id, current_level_id=bronze.id)
        db.add(progress)

    if smtp_enabled and not auto_verified:
        # Идэвхжүүлэх токен үүсгэх
        raw_token = secrets.token_urlsafe(32)
        db_token = VerificationToken(
            user_id=user.id,
            token=raw_token,
            token_type="VERIFY",
            expires_at=datetime.utcnow() + timedelta(hours=24),
        )
        db.add(db_token)
        await db.commit()

        # И-мэйл илгээх
        try:
            await send_verification_email(user.email, user.username, raw_token, db)
            return RegisterResponse(message="Бүртгэл амжилттай үүслээ. Баталгаажуулах и-мэйлийг таны хаяг руу илгээв.")
        except Exception as e:
            logger.error(f"Failed to send verification email: {str(e)}")
            # И-мэйл илгээлт амжилтгүй болсон ч бүртгэлийг хадгалж, хэрэглэгчид мэдэгдэнэ
            return RegisterResponse(message="Бүртгэл амжилттай үүслээ. Гэхдээ баталгаажуулах и-мэйл илгээхэд алдаа гарлаа. Дараа дахин оролдоно уу эсвэл Admin-тай холбогдоно уу.")
    else:
        await db.commit()
        return RegisterResponse(message="Бүртгэл амжилттай үүслээ. Нэвтэрч болно.")


@router.post(
    "/login",
    response_model=SessionResponse,
    summary="Нэвтрэх (email эсвэл username + password)",
    dependencies=[Depends(rate_limit_auth)],
)
async def login(
    payload: LoginIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # email эсвэл username-ээр хайх
    result = await db.execute(
        select(User).where(
            (User.username == payload.login) | (User.email == payload.login)
        )
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Нэвтрэх нэр эсвэл нууц үг буруу байна.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Таны акаунт идэвхгүй болсон байна.",
        )

    # И-мэйл баталгаажуулсан эсэхийг шалгах (и-мэйл систем идэвхтэй үед)
    try:
        smtp_cfg = await get_smtp_config(db)
        smtp_enabled = smtp_cfg.get("enabled", False)
    except Exception:
        smtp_enabled = False
    if smtp_enabled and not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Таны и-мэйл хаяг баталгаажаагүй байна. И-мэйл хаягаа баталгаажуулна уу.",
        )

    # Сүүлийн нэвтрэлтийн огноог шинэчлэх
    user.last_login_at = datetime.utcnow()

    # Шинэ refresh token үүсгэж хадгалах
    raw_refresh = generate_refresh_token()
    db_refresh = RefreshToken(
        user_id=user.id,
        token=raw_refresh,
        expires_at=refresh_token_expires_at(),
        device_info=request.headers.get("User-Agent", "")[:255],
    )
    db.add(db_refresh)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(subject=str(user.id), role=user.role.value)
    from fastapi.responses import JSONResponse
    response = JSONResponse(content=SessionResponse(expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, user=_user_dict(user)).model_dump())
    set_session_cookies(response, access_token, raw_refresh)
    return response


@router.post(
    "/verify",
    summary="И-мэйл баталгаажуулах холбоосоор бүртгэл идэвхжүүлэх",
)
async def verify_email(
    payload: VerifyIn,
    db: AsyncSession = Depends(get_db),
):
    # Токен шалгах
    result = await db.execute(
        select(VerificationToken).where(
            VerificationToken.token == payload.token,
            VerificationToken.token_type == "VERIFY",
        )
    )
    db_token = result.scalar_one_or_none()

    if not db_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Баталгаажуулах токен хүчингүй байна.",
        )

    if db_token.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Баталгаажуулах токены хугацаа дууссан байна. Дахин бүртгүүлнэ үү.",
        )

    # Хэрэглэгчийг идэвхжүүлэх
    user_res = await db.execute(select(User).where(User.id == db_token.user_id))
    user = user_res.scalar_one()
    user.is_verified = True

    # Токеныг устгах
    await db.delete(db_token)
    await db.commit()

    return {"message": "И-мэйл амжилттай баталгаажлаа. Та одоо нэвтрэх боломжтой."}


@router.post(
    "/forgot-password",
    summary="Нууц үг сэргээх и-мэйл илгээх хүсэлт гаргах",
)
async def forgot_password(
    payload: ForgotPasswordIn,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    if not user:
        # Аюулгүй байдлын үүднээс и-мэйл байхгүй ч амжилттай илгээсэн мэт хариу өгнө
        return {"message": "Хэрэв и-мэйл хаяг бүртгэлтэй бол сэргээх холбоосыг илгээв."}

    # Хуучин сэргээх токеныг устгах
    await db.execute(
        select(VerificationToken).where(
            VerificationToken.user_id == user.id,
            VerificationToken.token_type == "RESET",
        )
    )

    # Шинэ сэргээх токен үүсгэх (1 цаг хүчинтэй)
    raw_token = secrets.token_urlsafe(32)
    db_token = VerificationToken(
        user_id=user.id,
        token=raw_token,
        token_type="RESET",
        expires_at=datetime.utcnow() + timedelta(hours=1),
    )
    db.add(db_token)
    await db.commit()

    try:
        await send_password_reset_email(user.email, user.username, raw_token, db)
    except Exception as e:
        logger.error(f"Failed to send password reset email: {str(e)}")

    return {"message": "Хэрэв и-мэйл хаяг бүртгэлтэй бол сэргээх холбоосыг илгээв."}


@router.post(
    "/reset-password",
    summary="Шинэ нууц үг хадгалах",
)
async def reset_password(
    payload: ResetPasswordIn,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VerificationToken).where(
            VerificationToken.token == payload.token,
            VerificationToken.token_type == "RESET",
        )
    )
    db_token = result.scalar_one_or_none()

    if not db_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нууц үг сэргээх токен хүчингүй байна.",
        )

    if db_token.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Сэргээх токены хугацаа дууссан байна. Дахин хүсэлт гаргана уу.",
        )

    user_res = await db.execute(select(User).where(User.id == db_token.user_id))
    user = user_res.scalar_one()

    # Нууц үг шинэчлэх
    user.hashed_password = get_password_hash(payload.new_password)

    # Токен устгах
    await db.delete(db_token)
    await db.commit()

    return {"message": "Нууц үг амжилттай шинэчлэгдлээ. Та одоо шинэ нууц үгээрээ нэвтэрнэ үү."}


@router.post(
    "/refresh",
    response_model=SessionResponse,
    summary="Refresh token-ээр шинэ access_token авах",
)
async def refresh_token(
    request: Request,
    body: Optional[RefreshTokenIn] = None,
    db: AsyncSession = Depends(get_db),
):
    # Refresh token DB-ээс хайж шалгах
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token == (body.refresh_token if body else request.cookies.get(REFRESH_COOKIE, "")),
            RefreshToken.is_revoked == False,
        )
    )
    db_token = result.scalar_one_or_none()

    if not db_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token хүчингүй эсвэл цуцлагдсан байна.",
        )
    if db_token.expires_at < datetime.utcnow():
        # Хугацаа дууссан token-г устгаж 401 буцаах
        db_token.is_revoked = True
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token-ийн хугацаа дууссан байна. Дахин нэвтэрнэ үү.",
        )

    # Хэрэглэгч хайх
    user_result = await db.execute(select(User).where(User.id == db_token.user_id))
    user = user_result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Хэрэглэгч олдсонгүй.")

    # Хуучин token-г устгаж шинийг үүсгэх (Token Rotation)
    db_token.is_revoked = True
    new_raw_refresh = generate_refresh_token()
    new_db_refresh = RefreshToken(
        user_id=user.id,
        token=new_raw_refresh,
        expires_at=refresh_token_expires_at(),
        device_info=request.headers.get("User-Agent", "")[:255],
    )
    db.add(new_db_refresh)
    await db.commit()
    await db.refresh(user)

    new_access = create_access_token(subject=str(user.id), role=user.role.value)
    from fastapi.responses import JSONResponse
    response = JSONResponse(content=SessionResponse(expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, user=_user_dict(user)).model_dump())
    set_session_cookies(response, new_access, new_raw_refresh)
    return response


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Гарах (Refresh token-г цуцлах)",
)
async def logout(
    request: Request,
    body: Optional[RefreshTokenIn] = None,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token == (body.refresh_token if body else request.cookies.get(REFRESH_COOKIE, "")))
    )
    db_token = result.scalar_one_or_none()
    if db_token:
        db_token.is_revoked = True
        await db.commit()
    # Token олдохгүй ч 204 буцаана (idempotent)
    from fastapi.responses import Response
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookies(response)
    return response


@router.get(
    "/me",
    summary="Одоогийн нэвтэрсэн хэрэглэгчийн мэдээлэл авах",
)
async def get_me(current_user: User = Depends(get_current_user)):
    return _user_dict(current_user)


@router.patch(
    "/me",
    summary="Профайл шинэчлэх (нэр, сургууль, анги, avatar)",
)
async def update_me(
    update: ProfileUpdateIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if update.full_name  is not None: current_user.full_name  = update.full_name
    if update.school     is not None: current_user.school     = update.school
    if update.grade      is not None: current_user.grade      = update.grade
    if update.avatar_url is not None: current_user.avatar_url = update.avatar_url

    await db.commit()
    await db.refresh(current_user)
    return _user_dict(current_user)


@router.post(
    "/change-password",
    summary="Нэвтэрсэн хэрэглэгч нууц үгээ өөрчлөх",
)
async def change_password(
    payload: PasswordUpdateIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Одоогийн нууц үг буруу байна.",
        )
    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Шинэ нууц үг наад зах нь 8 тэмдэгт байх ёстой.",
        )
    current_user.hashed_password = get_password_hash(payload.new_password)
    await db.commit()
    return {"message": "Нууц үг амжилттай солигдлоо."}
