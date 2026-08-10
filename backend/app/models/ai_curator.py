import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Enum, DateTime, Boolean
from app.core.database import Base

class CuratorDataStatus(str, enum.Enum):
    DRAFT = "Draft"
    APPROVED = "Approved"
    REJECTED = "Rejected"

class TopicDataPool(Base):
    __tablename__ = "topic_data_pool"

    id = Column(Integer, primary_key=True, index=True)
    topic = Column(String(100), nullable=False, index=True) # e.g. "Binary Search", "Graph Theory"
    title = Column(String(200), nullable=False)
    content_mongolian = Column(Text, nullable=False)
    source_url = Column(String(255), nullable=True)
    status = Column(Enum(CuratorDataStatus), default=CuratorDataStatus.DRAFT, nullable=False, index=True)
    is_vector_indexed = Column(Boolean, default=False, nullable=False)
    qdrant_point_id = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
