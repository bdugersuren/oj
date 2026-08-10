import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from app.core.database import Base

class SubmissionStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    ACCEPTED = "AC"
    WRONG_ANSWER = "WA"
    TIME_LIMIT = "TLE"
    MEMORY_LIMIT = "MLE"
    RUNTIME_ERROR = "RTE"
    COMPILATION_ERROR = "CE"

class Submission(Base):
    __tablename__ = "submissions"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    problem_id = Column(Integer, ForeignKey("problems.id", ondelete="CASCADE"), nullable=False, index=True)
    language = Column(String(20), default="cpp", nullable=False)
    source_code = Column(Text, nullable=False)
    status = Column(Enum(SubmissionStatus), default=SubmissionStatus.PENDING, nullable=False)
    score = Column(Integer, default=0, nullable=False)
    time_ms = Column(Float, default=0.0, nullable=False)
    memory_kb = Column(Float, default=0.0, nullable=False)
    error_log = Column(Text, nullable=True)
    submitted_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="submissions")
    problem = relationship("Problem", back_populates="submissions")
    judge_results = relationship("JudgeResult", back_populates="submission", cascade="all, delete-orphan")

class JudgeResult(Base):
    __tablename__ = "judge_results"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False)
    testcase_id = Column(Integer, nullable=False)
    status = Column(Enum(SubmissionStatus), default=SubmissionStatus.PENDING, nullable=False)
    time_ms = Column(Float, default=0.0, nullable=False)
    memory_kb = Column(Float, default=0.0, nullable=False)
    output_log = Column(Text, nullable=True)

    # Relationships
    submission = relationship("Submission", back_populates="judge_results")
