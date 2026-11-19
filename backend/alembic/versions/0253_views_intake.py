"""Saved views and intake requests.

Revision ID: 0253_views_intake
Revises: 0252_cycles_modules
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0253_views_intake"
down_revision: str | None = "0252_cycles_modules"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _base() -> list[sa.Column]:
    return [
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
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
    ]


def _stamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    ]


def _user(name: str) -> sa.Column:
    return sa.Column(
        name, postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")
    )


def upgrade() -> None:
    op.create_table(
        "project_views",
        *_base(),
        sa.Column("filters", postgresql.JSONB(), nullable=False, server_default="{}"),
        _user("created_by_user_id"),
        *_stamps(),
    )
    op.create_index("project_views_organization_id_idx", "project_views", ["organization_id"])
    op.create_index("project_views_project_id_idx", "project_views", ["project_id"])

    op.create_table(
        "intake_requests",
        *_base(),
        sa.Column("priority", sa.String(8), nullable=False, server_default="none"),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        _user("requested_by_user_id"),
        _user("decided_by_user_id"),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("snoozed_until", sa.Date()),
        sa.Column(
            "work_item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("work_items.id", ondelete="SET NULL"),
        ),
        *_stamps(),
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'declined', 'snoozed', 'duplicate')",
            name=op.f("intake_requests_ck_intake_status_check"),
        ),
        sa.CheckConstraint(
            "priority IN ('none', 'urgent', 'high', 'medium', 'low')",
            name=op.f("intake_requests_ck_intake_priority_check"),
        ),
    )
    op.create_index("intake_requests_organization_id_idx", "intake_requests", ["organization_id"])
    op.create_index("intake_requests_project_id_idx", "intake_requests", ["project_id"])


def downgrade() -> None:
    op.drop_table("intake_requests")
    op.drop_table("project_views")
