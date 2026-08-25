from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class WorkspaceJudgeJob(Base):
    __tablename__ = "workspace_judge_jobs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    problem_code = Column(String(30), nullable=False, index=True)
    kind = Column(String(30), nullable=False, default="verify_solution")
    status = Column(String(30), nullable=False, default="QUEUED", index=True)
    request_payload = Column(JSON, nullable=True)
    result = Column(JSON, nullable=True)
    error_log = Column(Text, nullable=True)
    judge_attempt = Column(Integer, nullable=False, default=0)
    lease_expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
