"""
Admin User Management API
GET  /api/v1/admin/users              — Хэрэглэгчдийн жагсаалт
GET  /api/v1/admin/users/{id}         — Нэг хэрэглэгчийн мэдээлэл
PATCH /api/v1/admin/users/{id}        — Хэрэглэгчийн эрх, баталгаажуулалт шинэчлэх
DELETE /api/v1/admin/users/{id}       — Хэрэглэгч устгах
"""
import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.core.database import get_db
from app.core.dependencies import require_role
from app.models.user import User, UserRole

router = APIRouter()


class UserOut(BaseModel):
    id: str
    username: str
    email: str
    full_name: Optional[str]
    role: str
    is_active: bool
    is_verified: bool
    school: Optional[str]
    grade: Optional[str]
    created_at: str
    last_login_at: Optional[str]

    @classmethod
    def from_orm(cls, u: User) -> "UserOut":
        return cls(
            id=str(u.id),
            username=u.username,
            email=u.email,
            full_name=u.full_name,
            role=u.role.value,
            is_active=u.is_active,
            is_verified=u.is_verified,
            school=u.school,
            grade=u.grade,
            created_at=u.created_at.isoformat(),
            last_login_at=u.last_login_at.isoformat() if u.last_login_at else None,
        )


class UserListResponse(BaseModel):
    users: List[UserOut]
    total: int
    page: int
    per_page: int


class UserUpdateIn(BaseModel):
    is_active:   Optional[bool] = None
    is_verified: Optional[bool] = None
    role:        Optional[UserRole] = None
    full_name:   Optional[str] = None
    school:      Optional[str] = None
    grade:       Optional[str] = None


@router.get(
    "",
    response_model=UserListResponse,
    summary="Бүх хэрэглэгчдийн жагсаалт (Зөвхөн Admin)",
)
async def list_users(
    page: int = 1,
    per_page: int = 20,
    role: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    query = select(User)
    if role:
        try:
            query = query.where(User.role == UserRole(role.upper()))
        except ValueError:
            pass
    if search:
        like = f"%{search}%"
        query = query.where(
            User.username.ilike(like) | User.email.ilike(like) | User.full_name.ilike(like)
        )

    # Count
    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar() or 0

    # Paginate
    query = query.order_by(User.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    users = result.scalars().all()

    return UserListResponse(
        users=[UserOut.from_orm(u) for u in users],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get(
    "/{user_id}",
    response_model=UserOut,
    summary="Нэг хэрэглэгчийн мэдээлэл",
)
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Буруу ID формат.")
    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Хэрэглэгч олдсонгүй.")
    return UserOut.from_orm(user)


@router.patch(
    "/{user_id}",
    response_model=UserOut,
    summary="Хэрэглэгчийн мэдээллийг шинэчлэх (Admin)",
)
async def update_user(
    user_id: str,
    payload: UserUpdateIn,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Буруу ID формат.")
    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Хэрэглэгч олдсонгүй.")

    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.is_verified is not None:
        user.is_verified = payload.is_verified
    if payload.role is not None:
        user.role = payload.role
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.school is not None:
        user.school = payload.school
    if payload.grade is not None:
        user.grade = payload.grade

    await db.commit()
    await db.refresh(user)
    return UserOut.from_orm(user)


@router.delete(
    "/{user_id}",
    summary="Хэрэглэгч устгах (Admin)",
)
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Буруу ID формат.")

    # Өөрийгөө устгахгүй
    if str(current_user.id) == user_id:
        raise HTTPException(status_code=400, detail="Та өөрийгөө устгаж болохгүй.")

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Хэрэглэгч олдсонгүй.")

    await db.delete(user)
    await db.commit()
    return {"message": f"{user.username} хэрэглэгч амжилттай устгагдлаа."}
