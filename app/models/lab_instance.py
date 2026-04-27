from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from app.database import Base
import uuid


class LabInstance(Base):
    """
    Represents a single lab session.
    Created when a user starts a lab, destroyed when it ends.
    One row per session - even if the same user runs the same lab twice.
    """

    __tablename__ = "lab_instances"

    # Unique session ID
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # Who started this lab
    user_id = Column(String, ForeignKey("users.id"), nullable=False)

    # Which lab template was used
    template_id = Column(String, ForeignKey("lab_templates.id"), nullable=False)

    # Current status of the lab
    # PROVISIONING -> RUNNING -> DESTROYING -> DESTROYED
    # FAILED if something went wrong
    status = Column(String, nullable=False, default="PROVISIONING")

    # CloudFormation stack name - used to destroy the lab
    # Format: orchestryx-lab-{instance_id}
    cfn_stack_name = Column(String, nullable=True)

    # Public IP of the EC2 instance - set when lab is RUNNING
    ec2_public_ip = Column(String, nullable=True)

    # Key in AWS Secrets Manager where WireGuard .conf is stored
    # Set when lab is RUNNING
    secrets_key = Column(String, nullable=True)

    # Whether the user has submitted the correct flag
    flag_submitted = Column(Boolean, default=False, nullable=False)

    # Timestamps
    started_at = Column(DateTime(timezone=True), server_default=func.now())

    # When the lab will auto-destroy (started_at + ttl_hours)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    # Set when lab is fully destroyed
    destroyed_at = Column(DateTime(timezone=True), nullable=True)
