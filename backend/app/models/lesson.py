import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Enum, Float
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class LessonCategory(str, enum.Enum):
    MATH = "Математик (Math for Olympiad)"
    ALGORITHMS = "Алгоритм (Algorithms & CP)"
    DATA_STRUCTURES = "Өгөгдлийн Бүтэц (Data Structures)"
    AI_ML = "Хиймэл Оюун ба Логик (AI/ML & Logic)"

class Lesson(Base):
    __tablename__ = "lessons"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(100), unique=True, index=True, nullable=False)
    title = Column(String(200), nullable=False)
    category = Column(Enum(LessonCategory), default=LessonCategory.ALGORITHMS, nullable=False)
    topic = Column(String(100), nullable=False, index=True) # e.g. "Тооны Онол", "Binary Search", "Граф"
    difficulty = Column(String(30), default="Bronze", nullable=False) # Bronze, Silver, Gold, Platinum
    estimated_minutes = Column(Integer, default=15, nullable=False)
    xp_reward = Column(Integer, default=25, nullable=False)
    summary = Column(Text, nullable=False)
    content_markdown = Column(Text, nullable=False)
    order = Column(Integer, default=1, nullable=False)
    is_published = Column(Boolean, default=True, nullable=False)
    is_public = Column(Boolean, default=True, nullable=False)  # True=нийтийн, False=зөвхөн холбогдсон ангиудад
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_by_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # Relationships
    quizzes = relationship("LessonQuiz", back_populates="lesson", cascade="all, delete-orphan", order_by="LessonQuiz.order")
    practice_problems = relationship("LessonProblem", back_populates="lesson", cascade="all, delete-orphan", order_by="LessonProblem.order")
    created_by = relationship("User", foreign_keys=[created_by_id])
    classroom_lessons = relationship("ClassroomLesson", back_populates="lesson", cascade="all, delete-orphan")

class LessonQuiz(Base):
    __tablename__ = "lesson_quizzes"

    id = Column(Integer, primary_key=True, index=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    question = Column(Text, nullable=False)
    options_json = Column(Text, nullable=False) # JSON string: ["Сонголт A", "Сонголт B"]
    correct_option_index = Column(Integer, nullable=True) # Fallback for backward compatibility
    correct_answers_json = Column(Text, nullable=True) # JSON array of correct option indexes or strings
    quiz_type = Column(String(30), default="single", nullable=False) # "single", "multiple", "text"
    explanation = Column(Text, nullable=False)
    order = Column(Integer, default=1, nullable=False)

    # Relationships
    lesson = relationship("Lesson", back_populates="quizzes")

class LessonProblem(Base):
    __tablename__ = "lesson_problems"

    id = Column(Integer, primary_key=True, index=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    problem_id = Column(Integer, ForeignKey("problems.id", ondelete="CASCADE"), nullable=False)
    order = Column(Integer, default=1, nullable=False)
    is_recommended = Column(Boolean, default=True, nullable=False)

    # Relationships
    lesson = relationship("Lesson", back_populates="practice_problems")
    problem = relationship("Problem")

class UserLessonProgress(Base):
    __tablename__ = "user_lesson_progress"

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    lesson_id    = Column(Integer, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    is_completed = Column(Boolean, default=False, nullable=False)
    quiz_score   = Column(Integer, default=0, nullable=False)
    solved_quizzes_json = Column(Text, default="[]", nullable=False) # JSON list of solved quiz IDs
    completed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
