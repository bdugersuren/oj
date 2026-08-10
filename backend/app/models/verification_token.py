import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class VerificationToken(Base):
    __tablename__ = "verification_tokens"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token      = Column(String(255), unique=True, nullable=False, index=True)
    token_type = Column(String(50), nullable=False)  # "VERIFY", "RESET"
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<VerificationToken token_type={self.token_type} user_id={self.user_id}>"
