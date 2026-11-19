"""Work items: who may touch them and what changing one records.

A work item belongs to a project and follows its access: whoever may see the
project reads its items, and whoever may use it creates and changes them.
Changes are written to the activity trail the way Plane records issue activity.
"""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.permissions import AuthContext, Perm
from app.db.models.work_item import WorkItem, WorkItemActivity, WorkItemComment
from app.db.updates import writable
from app.repositories import planning as planning_repo
from app.repositories import work_item as repo
from app.schemas.work_item import CommentCreate, WorkItemCreate, WorkItemUpdate
from app.services.project import ProjectService

_TRACKED = (
    "name",
    "description",
    "state",
    "priority",
    "assignee_user_id",
    "start_date",
    "target_date",
    "labels",
    "cycle_id",
)


def _text(value: object) -> str | None:
    if value is None:
        return None
    return ",".join(map(str, value)) if isinstance(value, list) else str(value)


class WorkItemService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.projects = ProjectService(db)

    async def _item(self, project_id: UUID, item_id: UUID) -> WorkItem:
        item = await repo.get(self.db, project_id, item_id)
        if item is None:
            raise NotFoundError(message="Work item not found", details={"work_item_id": item_id})
        return item

    async def _check_cycle(self, project_id: UUID, cycle_id: UUID | None) -> None:
        if (
            cycle_id is not None
            and await planning_repo.get_cycle(self.db, project_id, cycle_id) is None
        ):
            raise NotFoundError(message="Cycle not found", details={"cycle_id": cycle_id})

    async def _with_modules(self, items: list[WorkItem]) -> list[WorkItem]:
        found = await planning_repo.module_ids_for(self.db, [i.id for i in items])
        for item in items:
            item.module_ids = found.get(item.id, [])  # ty: ignore[unresolved-attribute]
        return items

    async def list(self, ctx: AuthContext, project_id: UUID, **filters):
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_VIEW)
        items, total = await repo.list_items(self.db, project_id, **filters)
        return await self._with_modules(items), total

    async def get(self, ctx: AuthContext, project_id: UUID, item_id: UUID) -> WorkItem:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_VIEW)
        (item,) = await self._with_modules([await self._item(project_id, item_id)])
        return item

    async def create(self, ctx: AuthContext, project_id: UUID, data: WorkItemCreate) -> WorkItem:
        # The project row lock taken by a `use` read serialises numbering.
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        await self._check_cycle(project_id, data.cycle_id)
        item = WorkItem(
            organization_id=ctx.organization_id,
            project_id=project_id,
            sequence_id=await repo.next_sequence(self.db, project_id),
            created_by_user_id=ctx.user_id,
            completed_at=datetime.now(UTC) if data.state == "done" else None,
            **data.model_dump(),
        )
        self.db.add(item)
        await self.db.flush()
        self.db.add(
            WorkItemActivity(
                work_item_id=item.id,
                actor_user_id=ctx.user_id,
                field="created",
                new_value=item.name,
            )
        )
        await self.db.flush()
        return item

    async def update(
        self, ctx: AuthContext, project_id: UUID, item_id: UUID, data: WorkItemUpdate
    ) -> WorkItem:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        item = await self._item(project_id, item_id)
        changes = writable(data, over=WorkItem)
        if "cycle_id" in changes:
            await self._check_cycle(project_id, changes["cycle_id"])
        for field in _TRACKED:
            if field not in changes:
                continue
            before, after = getattr(item, field), changes[field]
            if before == after:
                continue
            setattr(item, field, after)
            self.db.add(
                WorkItemActivity(
                    work_item_id=item.id,
                    actor_user_id=ctx.user_id,
                    field=field,
                    old_value=_text(before),
                    new_value=_text(after),
                )
            )
        if "state" in changes:
            item.completed_at = datetime.now(UTC) if item.state == "done" else None
        if item.start_date and item.target_date and item.start_date > item.target_date:
            from app.core.exceptions import BadRequestError

            raise BadRequestError(message="target_date precedes start_date")
        await self.db.flush()
        (item,) = await self._with_modules([item])
        return item

    async def delete(self, ctx: AuthContext, project_id: UUID, item_id: UUID) -> None:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        await self.db.delete(await self._item(project_id, item_id))
        await self.db.flush()

    async def comments(self, ctx: AuthContext, project_id: UUID, item_id: UUID):
        await self.get(ctx, project_id, item_id)
        return await repo.comments(self.db, item_id)

    async def comment(
        self, ctx: AuthContext, project_id: UUID, item_id: UUID, data: CommentCreate
    ) -> WorkItemComment:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        await self._item(project_id, item_id)
        row = WorkItemComment(work_item_id=item_id, author_user_id=ctx.user_id, body=data.body)
        self.db.add(row)
        await self.db.flush()
        return row

    async def activities(self, ctx: AuthContext, project_id: UUID, item_id: UUID):
        await self.get(ctx, project_id, item_id)
        return await repo.activities(self.db, item_id)
