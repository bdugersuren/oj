from sqlalchemy import Column, String, Text
from app.core.database import Base


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key         = Column(String(100), primary_key=True, index=True)
    value       = Column(Text, nullable=False)
    description = Column(String(255), nullable=True)

    def __repr__(self) -> str:
        return f"<SystemSetting key={self.key}>"
