"""Add ECS Fargate lab runtime metadata.

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-09 13:10:00 UTC
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("lab_instances", sa.Column("ecs_cluster_name", sa.String(), nullable=True))
    op.add_column("lab_instances", sa.Column("ecs_task_arn", sa.String(), nullable=True))
    op.add_column("lab_instances", sa.Column("ecs_task_definition_arn", sa.String(), nullable=True))
    op.add_column("lab_instances", sa.Column("ecs_last_status", sa.String(), nullable=True))
    op.add_column("lab_instances", sa.Column("ecs_desired_status", sa.String(), nullable=True))
    op.add_column("lab_instances", sa.Column("ecs_container_name", sa.String(), nullable=True))
    op.add_column("lab_instances", sa.Column("ecs_log_group", sa.String(), nullable=True))
    op.add_column("lab_instances", sa.Column("ecs_log_stream_name", sa.String(), nullable=True))
    op.add_column("lab_instances", sa.Column("ecs_network_interface_id", sa.String(), nullable=True))
    op.add_column("lab_instances", sa.Column("ecs_private_ip", sa.String(), nullable=True))
    op.add_column("lab_instances", sa.Column("ecs_public_ip", sa.String(), nullable=True))
    op.add_column("lab_instances", sa.Column("ecs_stop_reason", sa.Text(), nullable=True))
    op.add_column("lab_instances", sa.Column("runtime_metadata", sa.JSON(), nullable=True))
    op.add_column("lab_instances", sa.Column("ecs_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("lab_instances", sa.Column("ecs_stopped_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_lab_instances_ecs_task_arn", "lab_instances", ["ecs_task_arn"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_lab_instances_ecs_task_arn", table_name="lab_instances")
    op.drop_column("lab_instances", "ecs_stopped_at")
    op.drop_column("lab_instances", "ecs_started_at")
    op.drop_column("lab_instances", "runtime_metadata")
    op.drop_column("lab_instances", "ecs_stop_reason")
    op.drop_column("lab_instances", "ecs_public_ip")
    op.drop_column("lab_instances", "ecs_private_ip")
    op.drop_column("lab_instances", "ecs_network_interface_id")
    op.drop_column("lab_instances", "ecs_log_stream_name")
    op.drop_column("lab_instances", "ecs_log_group")
    op.drop_column("lab_instances", "ecs_container_name")
    op.drop_column("lab_instances", "ecs_desired_status")
    op.drop_column("lab_instances", "ecs_last_status")
    op.drop_column("lab_instances", "ecs_task_definition_arn")
    op.drop_column("lab_instances", "ecs_task_arn")
    op.drop_column("lab_instances", "ecs_cluster_name")
