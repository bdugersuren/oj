import enum
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Boolean, DateTime, Enum,
    ForeignKey, Text
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class UserRole(str, enum.Enum):
    ADMIN   = "admin"
    TEACHER = "teacher"
    STUDENT = "student"


class User(Base):
    __tablename__ = "users"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    email           = Column(String(255), unique=True, index=True, nullable=False)
    username        = Column(String(50),  unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role            = Column(Enum(UserRole), default=UserRole.STUDENT, nullable=False)

    # Profile
    full_name   = Column(String(150), nullable=True)
    avatar_url  = Column(String(500), nullable=True)
    school      = Column(String(200), nullable=True)
    grade       = Column(String(50),  nullable=True)   # "10-р анги"

    # Status
    is_active   = Column(Boolean, default=True,  nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)

    last_login_at = Column(DateTime, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    progress       = relationship("StudentProgress", back_populates="user", uselist=False, cascade="all, delete-orphan")
    submissions    = relationship("Submission",      back_populates="user", cascade="all, delete-orphan")
    achievements   = relationship("UserAchievement", back_populates="user", cascade="all, delete-orphan")
    tickets        = relationship("Ticket", back_populates="student",
                                  foreign_keys="[Ticket.student_id]", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User {self.username} ({self.role.value})>"


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id     = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token       = Column(String(512), unique=True, nullable=False, index=True)
    expires_at  = Column(DateTime, nullable=False)
    is_revoked  = Column(Boolean, default=False, nullable=False)
    device_info = Column(String(255), nullable=True)  # Browser / OS info
    created_at  = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="refresh_tokens")

    def __repr__(self) -> str:
        return f"<RefreshToken user_id={self.user_id} revoked={self.is_revoked}>"
