from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from app.core.database import Base

class Contest(Base):
    __tablename__ = "contests"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    creator_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    is_public = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    creator = relationship("User")
    problems = relationship("ContestProblem", back_populates="contest", cascade="all, delete-orphan", order_by="ContestProblem.order")
    participants = relationship("ContestParticipant", back_populates="contest", cascade="all, delete-orphan")
    teams = relationship("ContestTeam", back_populates="contest", cascade="all, delete-orphan")

class ContestProblem(Base):
    __tablename__ = "contest_problems"

    id = Column(Integer, primary_key=True, index=True)
    contest_id = Column(Integer, ForeignKey("contests.id", ondelete="CASCADE"), nullable=False)
    problem_id = Column(Integer, ForeignKey("problems.id", ondelete="CASCADE"), nullable=False)
    points = Column(Integer, default=100, nullable=False)
    order = Column(Integer, default=1, nullable=False)

    # Relationships
    contest = relationship("Contest", back_populates="problems")
    problem = relationship("Problem")

class ContestParticipant(Base):
    __tablename__ = "contest_participants"

    id = Column(Integer, primary_key=True, index=True)
    contest_id = Column(Integer, ForeignKey("contests.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    registered_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    contest = relationship("Contest", back_populates="participants")
    user = relationship("User")

class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    school = Column(String(160), nullable=True)
    invite_code = Column(String(20), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    members = relationship("TeamMember", back_populates="team", cascade="all, delete-orphan")
    contests = relationship("ContestTeam", back_populates="team", cascade="all, delete-orphan")

class TeamMember(Base):
    __tablename__ = "team_members"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    is_captain = Column(Boolean, default=False, nullable=False)
    team = relationship("Team", back_populates="members")
    user = relationship("User")

class ContestTeam(Base):
    __tablename__ = "contest_teams"

    id = Column(Integer, primary_key=True, index=True)
    contest_id = Column(Integer, ForeignKey("contests.id", ondelete="CASCADE"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    registered_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    contest = relationship("Contest", back_populates="teams")
    team = relationship("Team", back_populates="contests")
