from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func
from apps.api.database import Base
import uuid


class LabEvent(Base):
    """Append-only provisioning and teardown event log for one lab instance."""

    __tablename__ = "lab_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    instance_id = Column(String, ForeignKey("lab_instances.id"), nullable=False, index=True)
    level = Column(String, nullable=False, default="info")
    phase = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    progress = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
