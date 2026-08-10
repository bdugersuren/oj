import enum
import uuid
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from app.core.database import Base

class DifficultyLevel(str, enum.Enum):
    BRONZE = "Bronze"
    SILVER = "Silver"
    GOLD = "Gold"
    PLATINUM = "Platinum"
    DIAMOND = "Diamond"

class OlympiadScope(str, enum.Enum):
    INTERNATIONAL = "Олон Улс (IOI, APIO)"
    NATIONAL = "Улсын Олимпиад (Finals)"
    PROVINCE_CITY = "Аймаг / Нийслэл"
    DISTRICT_SCHOOL = "Дүүрэг / Сургууль"
    UNIVERSITY = "Их Дээд Сургууль (ICPC)"
    TRAINING = "Сургалтын Дасгал"

class DivisionCategory(str, enum.Enum):
    ELEMENTARY = "Бага анги (3-5 анги)"
    JUNIOR = "Дунд анги (6-9 анги)"
    SENIOR = "Ахлах анги (10-12 анги)"
    TEACHER = "Багш нарын ангилал"
    GENERAL = "Ерөнхий"

class Problem(Base):
    __tablename__ = "problems"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(30), unique=True, index=True, nullable=False) # e.g. 1001, BF101
    title = Column(String(200), nullable=False)
    statement_markdown = Column(Text, nullable=False)
    statement_pdf_path = Column(String(255), nullable=True)
    time_limit = Column(Float, default=1.0, nullable=False) # in seconds
    memory_limit = Column(Integer, default=64, nullable=False) # in MB
    points = Column(Integer, default=10, nullable=False)
    xp_reward = Column(Integer, default=20, nullable=False)
    difficulty = Column(Enum(DifficultyLevel), default=DifficultyLevel.BRONZE, nullable=False)
    topic = Column(String(50), default="Brute Force", nullable=False, index=True)
    
    # Olympiad Extended Metadata
    olympiad_scope = Column(Enum(OlympiadScope), default=OlympiadScope.TRAINING, nullable=False)
    division = Column(Enum(DivisionCategory), default=DivisionCategory.SENIOR, nullable=False)
    olympiad_year = Column(Integer, default=2024, nullable=True)
    source_citation = Column(String(255), nullable=True) # e.g. "2023 Нийслэлийн Олимпиад 2-р Даваа, 3-р Бодлого"

    is_visible = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_by_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # Relationships
    test_cases = relationship("TestCase", back_populates="problem", cascade="all, delete-orphan", order_by="TestCase.order")
    submissions = relationship("Submission", back_populates="problem", cascade="all, delete-orphan")
    hints = relationship("ProblemHint", back_populates="problem", cascade="all, delete-orphan", order_by="ProblemHint.level")
    created_by = relationship("User", foreign_keys=[created_by_id])

class ProblemHint(Base):
    __tablename__ = "problem_hints"

    id = Column(Integer, primary_key=True, index=True)
    problem_id = Column(Integer, ForeignKey("problems.id", ondelete="CASCADE"), nullable=False)
    level = Column(Integer, default=1, nullable=False) # 1: Concept, 2: Edge Case, 3: Pseudocode
    title = Column(String(100), nullable=False)
    hint_text = Column(Text, nullable=False)
    xp_penalty = Column(Integer, default=5, nullable=False) # e.g. -5 XP or -5% score

    # Relationships
    problem = relationship("Problem", back_populates="hints")

class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(Integer, primary_key=True, index=True)
    problem_id = Column(Integer, ForeignKey("problems.id", ondelete="CASCADE"), nullable=False)
    input_data = Column(Text, nullable=False)
    output_data = Column(Text, nullable=False)
    points = Column(Integer, default=10, nullable=False)
    order = Column(Integer, default=1, nullable=False)
    is_sample = Column(Boolean, default=False, nullable=False)

    # Relationships
    problem = relationship("Problem", back_populates="test_cases")
