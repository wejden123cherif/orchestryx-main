import uuid

from sqlalchemy import Column, DateTime, ForeignKey, JSON, String
from sqlalchemy.sql import func

from apps.api.database import Base


class LabAccessRule(Base):
    """
    Per-lab network access rule.
    Captures which VPN IP may reach which lab IP on which ports, and which
    EC2 security group was created to enforce it.

    One rule is created per lab instance during provisioning and revoked on destroy.
    """

    __tablename__ = "lab_access_rules"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    instance_id = Column(String, ForeignKey("lab_instances.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)

    # FK to vpn_peers; nullable to handle cases where VPN is not configured.
    vpn_peer_id = Column(String, ForeignKey("vpn_peers.id"), nullable=True)

    # Source VPN IP (/32) allowed to reach the lab.
    source_vpn_ip = Column(String, nullable=False)

    # ECS task private IP — populated once the task is RUNNING.
    destination_lab_ip = Column(String, nullable=True)

    # List of TCP ports allowed, e.g. [3000].
    allowed_ports = Column(JSON, nullable=False)

    # The per-lab EC2 security group that enforces this rule.
    security_group_id = Column(String, nullable=True)

    # "active" | "revoked"
    status = Column(String, nullable=False, default="active")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
