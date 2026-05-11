"""Phase 1 security: per-lab SG tracking, VPN peer table, access rule table.

Changes
-------
- lab_instances: add ecs_security_group_id (per-lab EC2 SG, deleted on destroy)
- lab_instances: add vpn_config_blob (rendered WireGuard .conf, replaces storing
  private key in secrets_key JSON)
- vpn_peers: new table, one row per lab instance, stores public_key + vpn_ip only
- lab_access_rules: new table, tracks source_vpn_ip → lab_ip + SG per lab

The secrets_key column is retained for backward compatibility with pre-Phase 1
rows. New rows store only {public_key, client_ip, peer_added, vpn_peer_id}
there — no private_key.

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-11 00:03:00 UTC
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- lab_instances additions ----------------------------------------- #
    op.add_column(
        "lab_instances",
        sa.Column("ecs_security_group_id", sa.String(), nullable=True),
    )
    op.add_column(
        "lab_instances",
        sa.Column("vpn_config_blob", sa.Text(), nullable=True),
    )

    # ---- vpn_peers -------------------------------------------------------- #
    op.create_table(
        "vpn_peers",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "instance_id",
            sa.String(),
            sa.ForeignKey("lab_instances.id"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("public_key", sa.String(), nullable=False),
        sa.Column("assigned_vpn_ip", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_vpn_peers_instance_id", "vpn_peers", ["instance_id"])
    op.create_index("ix_vpn_peers_user_id", "vpn_peers", ["user_id"])

    # ---- lab_access_rules ------------------------------------------------- #
    op.create_table(
        "lab_access_rules",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "instance_id",
            sa.String(),
            sa.ForeignKey("lab_instances.id"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "vpn_peer_id",
            sa.String(),
            sa.ForeignKey("vpn_peers.id"),
            nullable=True,
        ),
        sa.Column("source_vpn_ip", sa.String(), nullable=False),
        sa.Column("destination_lab_ip", sa.String(), nullable=True),
        sa.Column("allowed_ports", sa.JSON(), nullable=False),
        sa.Column("security_group_id", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_lab_access_rules_instance_id", "lab_access_rules", ["instance_id"]
    )
    op.create_index(
        "ix_lab_access_rules_user_id", "lab_access_rules", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_lab_access_rules_user_id", table_name="lab_access_rules")
    op.drop_index("ix_lab_access_rules_instance_id", table_name="lab_access_rules")
    op.drop_table("lab_access_rules")

    op.drop_index("ix_vpn_peers_user_id", table_name="vpn_peers")
    op.drop_index("ix_vpn_peers_instance_id", table_name="vpn_peers")
    op.drop_table("vpn_peers")

    op.drop_column("lab_instances", "vpn_config_blob")
    op.drop_column("lab_instances", "ecs_security_group_id")
