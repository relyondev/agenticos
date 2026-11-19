"""Project work items, with comments and an activity trail.

Revision ID: 0251_work_items
Revises: 0250_discord_channel
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0251_work_items"
down_revision: str | None = "0250_discord_channel"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "work_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sequence_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("state", sa.String(16), nullable=False, server_default="backlog"),
        sa.Column("priority", sa.String(8), nullable=False, server_default="none"),
        sa.Column(
            "assignee_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column("start_date", sa.Date()),
        sa.Column("target_date", sa.Date()),
        sa.Column("labels", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("sort_order", sa.Float(), nullable=False, server_default="65535"),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("project_id", "sequence_id", name="uq_work_item_sequence"),
        sa.CheckConstraint(
            "state IN ('backlog', 'todo', 'in_progress', 'done', 'cancelled')",
            name=op.f("work_items_ck_work_item_state_check"),
        ),
        sa.CheckConstraint(
            "priority IN ('none', 'urgent', 'high', 'medium', 'low')",
            name=op.f("work_items_ck_work_item_priority_check"),
        ),
        sa.CheckConstraint(
            "start_date IS NULL OR target_date IS NULL OR start_date <= target_date",
            name=op.f("work_items_ck_work_item_dates_check"),
        ),
    )
    op.create_index("work_items_organization_id_idx", "work_items", ["organization_id"])
    op.create_index("work_items_project_id_idx", "work_items", ["project_id"])

    op.create_table(
        "work_item_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "work_item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("work_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "author_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("work_item_comments_work_item_id_idx", "work_item_comments", ["work_item_id"])

    op.create_table(
        "work_item_activities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "work_item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("work_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "actor_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column("field", sa.String(32), nullable=False),
        sa.Column("old_value", sa.Text()),
        sa.Column("new_value", sa.Text()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "work_item_activities_work_item_id_idx", "work_item_activities", ["work_item_id"]
    )


def downgrade() -> None:
    op.drop_table("work_item_activities")
    op.drop_table("work_item_comments")
    op.drop_table("work_items")
