"""Cycles and modules, and a work item's cycle.

Revision ID: 0252_cycles_modules
Revises: 0251_work_items
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0252_cycles_modules"
down_revision: str | None = "0251_work_items"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _owner_columns() -> list[sa.Column]:
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


def _tail_columns() -> list[sa.Column]:
    return [
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    ]


def upgrade() -> None:
    op.create_table(
        "cycles",
        *_owner_columns(),
        sa.Column("start_date", sa.Date()),
        sa.Column("end_date", sa.Date()),
        *_tail_columns(),
        sa.CheckConstraint(
            "start_date IS NULL OR end_date IS NULL OR start_date <= end_date",
            name=op.f("cycles_ck_cycle_dates_check"),
        ),
    )
    op.create_index("cycles_organization_id_idx", "cycles", ["organization_id"])
    op.create_index("cycles_project_id_idx", "cycles", ["project_id"])

    op.create_table(
        "modules",
        *_owner_columns(),
        sa.Column("status", sa.String(16), nullable=False, server_default="backlog"),
        sa.Column("start_date", sa.Date()),
        sa.Column("target_date", sa.Date()),
        sa.Column(
            "lead_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        *_tail_columns(),
        sa.CheckConstraint(
            "status IN ('backlog', 'planned', 'in_progress', 'paused', 'completed', 'cancelled')",
            name=op.f("modules_ck_module_status_check"),
        ),
        sa.CheckConstraint(
            "start_date IS NULL OR target_date IS NULL OR start_date <= target_date",
            name=op.f("modules_ck_module_dates_check"),
        ),
    )
    op.create_index("modules_organization_id_idx", "modules", ["organization_id"])
    op.create_index("modules_project_id_idx", "modules", ["project_id"])

    op.create_table(
        "module_work_items",
        sa.Column(
            "module_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("modules.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "work_item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("work_items.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    op.create_index("module_work_items_work_item_id_idx", "module_work_items", ["work_item_id"])

    op.add_column(
        "work_items",
        sa.Column(
            "cycle_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cycles.id", ondelete="SET NULL"),
        ),
    )
    op.create_index("work_items_cycle_id_idx", "work_items", ["cycle_id"])


def downgrade() -> None:
    op.drop_index("work_items_cycle_id_idx", table_name="work_items")
    op.drop_column("work_items", "cycle_id")
    op.drop_table("module_work_items")
    op.drop_table("modules")
    op.drop_table("cycles")
