from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Integer, Text, JSON
from sqlalchemy.sql import func
from apps.api.database import Base
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

    # Current status of the lab.
    # QUEUED -> PROVISIONING -> STARTING -> READY -> STOPPED
    # FAILED if something went wrong; EXPIRED before TTL teardown.
    # Older RUNNING/DESTROYING/DESTROYED rows are normalized at API boundaries.
    status = Column(String, nullable=False, default="QUEUED")

    # User-facing provisioning progress. Workers update these at phase changes
    # so the UI can show useful status instead of an opaque spinner.
    progress = Column(Integer, nullable=False, default=0)
    status_message = Column(String, nullable=False, default="Queued for provisioning.")
    failure_reason = Column(Text, nullable=True)
    retry_count = Column(Integer, nullable=False, default=0)

    # Legacy CloudFormation stack name. Retained for older rows only.
    cfn_stack_name = Column(String, nullable=True)

    # Legacy public IP field. Retained for older rows only.
    ec2_public_ip = Column(String, nullable=True)

    # Runtime access secret key. Retained for future runtime use and older rows.
    secrets_key = Column(String, nullable=True)

    # ECS Fargate runtime metadata for the current lab deployment path.
    ecs_cluster_name = Column(String, nullable=True)
    ecs_task_arn = Column(String, nullable=True)
    ecs_task_definition_arn = Column(String, nullable=True)
    ecs_last_status = Column(String, nullable=True)
    ecs_desired_status = Column(String, nullable=True)
    ecs_container_name = Column(String, nullable=True)
    ecs_log_group = Column(String, nullable=True)
    ecs_log_stream_name = Column(String, nullable=True)
    ecs_network_interface_id = Column(String, nullable=True)
    ecs_private_ip = Column(String, nullable=True)
    ecs_public_ip = Column(String, nullable=True)
    ecs_stop_reason = Column(Text, nullable=True)
    runtime_metadata = Column(JSON, nullable=True)

    # Whether the user has submitted the correct flag
    flag_submitted = Column(Boolean, default=False, nullable=False)

    # Timestamps
    started_at = Column(DateTime(timezone=True), server_default=func.now())

    # When the lab will auto-destroy (started_at + ttl_hours)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    # Set when lab is fully destroyed
    destroyed_at = Column(DateTime(timezone=True), nullable=True)

    ecs_started_at = Column(DateTime(timezone=True), nullable=True)
    ecs_stopped_at = Column(DateTime(timezone=True), nullable=True)

    # Lifecycle timing used for troubleshooting slow starts and cleanup jobs.
    provisioning_started_at = Column(DateTime(timezone=True), nullable=True)
    ready_at = Column(DateTime(timezone=True), nullable=True)
    last_status_at = Column(DateTime(timezone=True), nullable=True)
