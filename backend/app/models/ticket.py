import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class TicketStatus(str, enum.Enum):
    OPEN     = "OPEN"
    ANSWERED = "ANSWERED"
    RESOLVED = "RESOLVED"


class Ticket(Base):
    __tablename__ = "tickets"

    id            = Column(Integer, primary_key=True, index=True)
    student_id    = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    teacher_id    = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
                           nullable=True)
    problem_id    = Column(Integer, ForeignKey("problems.id", ondelete="CASCADE"), nullable=False)
    submission_id = Column(Integer, ForeignKey("submissions.id", ondelete="SET NULL"), nullable=True)
    title         = Column(String(200), nullable=False)
    status        = Column(Enum(TicketStatus), default=TicketStatus.OPEN, nullable=False)
    created_at    = Column(DateTime, default=datetime.utcnow, nullable=False)
    resolved_at   = Column(DateTime, nullable=True)

    # Relationships
    student    = relationship("User", foreign_keys=[student_id], back_populates="tickets")
    teacher    = relationship("User", foreign_keys=[teacher_id])
    problem    = relationship("Problem")
    submission = relationship("Submission")
    messages   = relationship("TicketMessage", back_populates="ticket",
                              cascade="all, delete-orphan", order_by="TicketMessage.created_at")


class TicketMessage(Base):
    __tablename__ = "ticket_messages"

    id           = Column(Integer, primary_key=True, index=True)
    ticket_id    = Column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    sender_id    = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                          nullable=False)
    content      = Column(Text, nullable=False)
    code_snippet = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    ticket = relationship("Ticket", back_populates="messages")
    sender = relationship("User")
