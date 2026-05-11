import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.sql import func

from apps.api.database import Base


class VpnPeer(Base):
    """
    One row per lab instance VPN peer.
    Tracks the public key and assigned VPN IP for a lab session.
    The private key is NEVER stored here — it lives only in vpn_config_blob
    on the LabInstance row until first download.
    """

    __tablename__ = "vpn_peers"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # One-to-one with lab_instances — each lab gets exactly one VPN peer.
    instance_id = Column(String, ForeignKey("lab_instances.id"), nullable=False, unique=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)

    # WireGuard public key registered on the gateway (base64-encoded X25519).
    public_key = Column(String, nullable=False)

    # VPN client IP assigned to this lab (10.8.x.y/32 in the WireGuard tunnel).
    assigned_vpn_ip = Column(String, nullable=False)

    # "active" | "revoked"
    status = Column(String, nullable=False, default="active")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    revoked_at = Column(DateTime(timezone=True), nullable=True)
