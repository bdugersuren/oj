from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class Classroom(Base):
    __tablename__ = "classrooms"

    id          = Column(Integer, primary_key=True, index=True)
    teacher_id  = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name        = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    invite_code = Column(String(20), unique=True, index=True, nullable=False)
    is_active   = Column(Boolean, default=True, nullable=False)
    created_at  = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    teacher  = relationship("User")
    students = relationship("ClassroomStudent", back_populates="classroom", cascade="all, delete-orphan")
    # Many-to-Many хичээлтэй холбоос
    classroom_lessons = relationship("ClassroomLesson", back_populates="classroom", cascade="all, delete-orphan")


class ClassroomStudent(Base):
    __tablename__ = "classroom_students"

    id           = Column(Integer, primary_key=True, index=True)
    classroom_id = Column(Integer, ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False)
    student_id   = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    joined_at    = Column(DateTime, default=datetime.utcnow, nullable=False)
    status       = Column(String(30), default="pending", nullable=False)  # pending, approved, rejected

    # Relationships
    classroom = relationship("Classroom", back_populates="students")
    student   = relationship("User")


class ClassroomLesson(Base):
    """Анги болон Хичээлийн Many-to-Many холбоос хүснэгт (Pattern 3)"""
    __tablename__ = "classroom_lessons"

    id           = Column(Integer, primary_key=True, index=True)
    classroom_id = Column(Integer, ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False)
    lesson_id    = Column(Integer, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    order        = Column(Integer, default=1, nullable=False)
    is_published = Column(Boolean, default=True, nullable=False)
    added_at     = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Unique constraint: нэг хичээл нэг ангид зөвхөн нэг удаа холбогдоно
    __table_args__ = (UniqueConstraint("classroom_id", "lesson_id", name="uq_classroom_lesson"),)

    # Relationships
    classroom = relationship("Classroom", back_populates="classroom_lessons")
    lesson    = relationship("Lesson", back_populates="classroom_lessons")
