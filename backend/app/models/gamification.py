from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from app.core.database import Base

class Achievement(Base):
    __tablename__ = "achievements"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, index=True, nullable=False)
    title = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    icon = Column(String(50), default="🏆", nullable=False)
    xp_bonus = Column(Integer, default=50, nullable=False)
    category = Column(String(30), default="general", nullable=False)

class UserAchievement(Base):
    __tablename__ = "user_achievements"

    id             = Column(Integer, primary_key=True, index=True)
    user_id        = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    achievement_id = Column(Integer, ForeignKey("achievements.id", ondelete="CASCADE"), nullable=False)
    unlocked_at    = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="achievements")
    achievement = relationship("Achievement")

class World(Base):
    __tablename__ = "worlds"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(50), unique=True, index=True, nullable=False)
    title = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    order = Column(Integer, default=1, nullable=False)
    required_level_id = Column(Integer, ForeignKey("student_levels.id"), default=1, nullable=False)

    # Relationships
    stages = relationship("Stage", back_populates="world", cascade="all, delete-orphan", order_by="Stage.order")

class Stage(Base):
    __tablename__ = "stages"

    id = Column(Integer, primary_key=True, index=True)
    world_id = Column(Integer, ForeignKey("worlds.id", ondelete="CASCADE"), nullable=False)
    slug = Column(String(50), unique=True, index=True, nullable=False)
    title = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    order = Column(Integer, default=1, nullable=False)
    boss_problem_id = Column(Integer, ForeignKey("problems.id"), nullable=True)

    # Relationships
    world = relationship("World", back_populates="stages")
    stage_problems = relationship("StageProblem", back_populates="stage", cascade="all, delete-orphan", order_by="StageProblem.order")

class StageProblem(Base):
    __tablename__ = "stage_problems"

    id = Column(Integer, primary_key=True, index=True)
    stage_id = Column(Integer, ForeignKey("stages.id", ondelete="CASCADE"), nullable=False)
    problem_id = Column(Integer, ForeignKey("problems.id", ondelete="CASCADE"), nullable=False)
    is_required = Column(Boolean, default=True, nullable=False)
    order = Column(Integer, default=1, nullable=False)

    # Relationships
    stage = relationship("Stage", back_populates="stage_problems")
    problem = relationship("Problem")
