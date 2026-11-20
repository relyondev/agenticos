"""Work items: data access. Who may see the project is decided by the service."""

from datetime import date
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.planning import ModuleWorkItem
from app.db.models.work_item import WorkItem, WorkItemActivity, WorkItemComment


async def next_sequence(db: AsyncSession, project_id: UUID) -> int:
    """The next number in the project. The caller holds the project's row lock."""
    result = await db.execute(
        select(func.coalesce(func.max(WorkItem.sequence_id), 0)).where(
            WorkItem.project_id == project_id
        )
    )
    return int(result.scalar_one()) + 1


async def get(db: AsyncSession, project_id: UUID, item_id: UUID) -> WorkItem | None:
    result = await db.execute(
        select(WorkItem).where(WorkItem.project_id == project_id, WorkItem.id == item_id)
    )
    return result.scalar_one_or_none()


async def get_by_sequence(db: AsyncSession, project_id: UUID, number: int) -> WorkItem | None:
    """The item people call `#number` in a project."""
    result = await db.execute(
        select(WorkItem).where(WorkItem.project_id == project_id, WorkItem.sequence_id == number)
    )
    return result.scalar_one_or_none()


async def list_items(
    db: AsyncSession,
    project_id: UUID,
    *,
    state: str | None = None,
    priority: str | None = None,
    assignee_user_id: UUID | None = None,
    label: str | None = None,
    cycle_id: UUID | None = None,
    module_id: UUID | None = None,
    due_before: date | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[WorkItem], int]:
    conditions = [WorkItem.project_id == project_id]
    if state:
        conditions.append(WorkItem.state == state)
    if priority:
        conditions.append(WorkItem.priority == priority)
    if assignee_user_id:
        conditions.append(WorkItem.assignee_user_id == assignee_user_id)
    if label:
        conditions.append(WorkItem.labels.contains([label]))
    if cycle_id:
        conditions.append(WorkItem.cycle_id == cycle_id)
    if module_id:
        conditions.append(
            WorkItem.id.in_(
                select(ModuleWorkItem.work_item_id).where(ModuleWorkItem.module_id == module_id)
            )
        )
    if due_before:
        conditions.append(WorkItem.target_date <= due_before)
    if search:
        like = f"%{search.replace('%', r'\%').replace('_', r'\_')}%"
        conditions.append(or_(WorkItem.name.ilike(like), WorkItem.description.ilike(like)))
    total = (
        await db.execute(select(func.count()).select_from(WorkItem).where(*conditions))
    ).scalar_one()
    rows = await db.execute(
        select(WorkItem)
        .where(*conditions)
        .order_by(WorkItem.sort_order, WorkItem.sequence_id)
        .offset(skip)
        .limit(limit)
    )
    return list(rows.scalars().all()), int(total)


async def comments(db: AsyncSession, item_id: UUID) -> list[WorkItemComment]:
    rows = await db.execute(
        select(WorkItemComment)
        .where(WorkItemComment.work_item_id == item_id)
        .order_by(WorkItemComment.created_at)
    )
    return list(rows.scalars().all())


async def activities(db: AsyncSession, item_id: UUID) -> list[WorkItemActivity]:
    rows = await db.execute(
        select(WorkItemActivity)
        .where(WorkItemActivity.work_item_id == item_id)
        .order_by(WorkItemActivity.created_at.desc())
    )
    return list(rows.scalars().all())
