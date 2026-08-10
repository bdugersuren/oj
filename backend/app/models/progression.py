import uuid
from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class StudentLevel(Base):
    __tablename__ = "student_levels"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(50), unique=True, nullable=False)
    min_xp          = Column(Integer, default=0, nullable=False)
    required_solved = Column(Integer, default=0, nullable=False)
    order           = Column(Integer, default=1, nullable=False)
    color           = Column(String(20), default="#cd7f32", nullable=False)
    icon            = Column(String(50), default="Star", nullable=False)


class StudentProgress(Base):
    __tablename__ = "student_progress"

    id               = Column(Integer, primary_key=True, index=True)
    # user_id is now UUID (migrated from INTEGER)
    user_id          = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                              unique=True, nullable=False)
    current_level_id = Column(Integer, ForeignKey("student_levels.id"), default=1, nullable=False)
    total_xp         = Column(Integer, default=0, nullable=False)
    solved_count     = Column(Integer, default=0, nullable=False)
    current_streak   = Column(Integer, default=0, nullable=False)
    highest_streak   = Column(Integer, default=0, nullable=False)
    elo_rating       = Column(Integer, default=1200, nullable=False)
    last_active_date = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user           = relationship("User", back_populates="progress")
    level          = relationship("StudentLevel")
    topic_masteries = relationship("TopicMastery", back_populates="progress", cascade="all, delete-orphan")


class TopicMastery(Base):
    __tablename__ = "topic_masteries"

    id                 = Column(Integer, primary_key=True, index=True)
    progress_id        = Column(Integer, ForeignKey("student_progress.id", ondelete="CASCADE"), nullable=False)
    topic_slug         = Column(String(50), nullable=False, index=True)
    mastery_percentage = Column(Float, default=0.0, nullable=False)
    solved_count       = Column(Integer, default=0, nullable=False)
    attempted_count    = Column(Integer, default=0, nullable=False)
    wrong_count        = Column(Integer, default=0, nullable=False)

    # Relationships
    progress = relationship("StudentProgress", back_populates="topic_masteries")
