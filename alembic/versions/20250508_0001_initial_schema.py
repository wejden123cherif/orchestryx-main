"""Initial schema — all tables from the existing SQLAlchemy models.

This revision creates the full schema from scratch. It is equivalent to
what Base.metadata.create_all() produced in the old startup() handler,
but expressed as a proper Alembic migration so it is versioned, auditable,
and safely re-runnable via `alembic upgrade head`.

Revision ID: 0001
Revises: (none — this is the first revision)
Create Date: 2025-05-08 00:01:00 UTC
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# ---------------------------------------------------------------------------
# Revision identifiers
# ---------------------------------------------------------------------------
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# upgrade — create all tables
# ---------------------------------------------------------------------------

def upgrade() -> None:
    # ── users ────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("cognito_sub", sa.String(), nullable=True),
        sa.Column("credits_balance", sa.Float(), nullable=True, server_default="5.0"),
        sa.Column("subscription_tier", sa.String(), nullable=True, server_default="free"),
        sa.Column("role", sa.String(), nullable=False, server_default="user"),
        sa.Column("is_disabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("max_active_labs", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cognito_sub"),
        sa.UniqueConstraint("email"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    # ── lab_templates ────────────────────────────────────────────────────
    op.create_table(
        "lab_templates",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("difficulty", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("credits_cost", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("ttl_hours", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("docker_image_uri", sa.String(), nullable=False),
        sa.Column("cdk_stack_class", sa.String(), nullable=False),
        sa.Column("instance_type", sa.String(), nullable=False, server_default="t3.small"),
        sa.Column("challenge_port", sa.Integer(), nullable=False, server_default="3000"),
        sa.Column("challenge_path", sa.String(), nullable=False, server_default="/"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── lab_flags ────────────────────────────────────────────────────────
    op.create_table(
        "lab_flags",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("template_id", sa.String(), nullable=False),
        sa.Column("flag_hash", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("template_id"),
    )
    op.create_index(op.f("ix_lab_flags_template_id"), "lab_flags", ["template_id"], unique=True)

    # ── lab_instances ────────────────────────────────────────────────────
    op.create_table(
        "lab_instances",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("template_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="QUEUED"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "status_message",
            sa.String(),
            nullable=False,
            server_default="Queued for provisioning.",
        ),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cfn_stack_name", sa.String(), nullable=True),
        sa.Column("ec2_public_ip", sa.String(), nullable=True),
        sa.Column("secrets_key", sa.String(), nullable=True),
        sa.Column("flag_submitted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("destroyed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provisioning_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ready_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["template_id"], ["lab_templates.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── lab_events ───────────────────────────────────────────────────────
    op.create_table(
        "lab_events",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("instance_id", sa.String(), nullable=False),
        sa.Column("level", sa.String(), nullable=False, server_default="info"),
        sa.Column("phase", sa.String(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["instance_id"], ["lab_instances.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_lab_events_instance_id"), "lab_events", ["instance_id"], unique=False
    )

    # ── credit_transactions ──────────────────────────────────────────────
    op.create_table(
        "credit_transactions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False, index=True),
        sa.Column("delta", sa.Float(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_credit_transactions_user_id"),
        "credit_transactions",
        ["user_id"],
        unique=False,
    )


# ---------------------------------------------------------------------------
# downgrade — drop all tables in reverse dependency order
# ---------------------------------------------------------------------------

def downgrade() -> None:
    op.drop_index(op.f("ix_credit_transactions_user_id"), table_name="credit_transactions")
    op.drop_table("credit_transactions")

    op.drop_index(op.f("ix_lab_events_instance_id"), table_name="lab_events")
    op.drop_table("lab_events")

    op.drop_table("lab_instances")

    op.drop_index(op.f("ix_lab_flags_template_id"), table_name="lab_flags")
    op.drop_table("lab_flags")

    op.drop_table("lab_templates")

    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
