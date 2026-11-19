"""Cycles and modules: grouping a project's work items in time and by theme.

Both follow the project's access, as work items do: whoever may see the project
reads them, whoever may use it creates and changes them.
"""

from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, NotFoundError
from app.core.permissions import AuthContext, Perm
from app.db.models.planning import Cycle, Module, ModuleWorkItem
from app.db.updates import writable
from app.repositories import planning as repo
from app.repositories import work_item as work_item_repo
from app.schemas.planning import (
    CycleCreate,
    CycleRead,
    CycleUpdate,
    ModuleCreate,
    ModuleRead,
    ModuleUpdate,
)
from app.services.project import ProjectService


def cycle_status(start: date | None, end: date | None, today: date) -> str:
    """Where a cycle is in time, as Plane's cycle queryset annotates it."""
    if start and end and start <= today <= end:
        return "current"
    if start and start > today:
        return "upcoming"
    if end and end < today:
        return "completed"
    return "draft"


def _ordered(start: date | None, end: date | None) -> None:
    if start and end and start > end:
        raise BadRequestError(message="The end date precedes the start date")


class PlanningService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.projects = ProjectService(db)

    async def _view(self, ctx: AuthContext, project_id: UUID) -> None:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_VIEW)

    async def _use(self, ctx: AuthContext, project_id: UUID) -> None:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)

    # -- cycles ---------------------------------------------------------------

    async def _cycle(self, project_id: UUID, cycle_id: UUID) -> Cycle:
        cycle = await repo.get_cycle(self.db, project_id, cycle_id)
        if cycle is None:
            raise NotFoundError(message="Cycle not found", details={"cycle_id": cycle_id})
        return cycle

    def _cycle_read(self, cycle: Cycle, counts: dict[UUID, tuple[int, int]]) -> CycleRead:
        total, done = counts.get(cycle.id, (0, 0))
        return CycleRead(
            id=cycle.id,
            project_id=cycle.project_id,
            name=cycle.name,
            description=cycle.description,
            start_date=cycle.start_date,
            end_date=cycle.end_date,
            status=cycle_status(cycle.start_date, cycle.end_date, datetime.now(UTC).date()),  # ty: ignore[invalid-argument-type]
            total_items=total,
            done_items=done,
            created_at=cycle.created_at,
        )

    async def list_cycles(self, ctx: AuthContext, project_id: UUID) -> list[CycleRead]:
        await self._view(ctx, project_id)
        counts = await repo.cycle_counts(self.db, project_id)
        return [self._cycle_read(c, counts) for c in await repo.list_cycles(self.db, project_id)]

    async def get_cycle(self, ctx: AuthContext, project_id: UUID, cycle_id: UUID) -> CycleRead:
        await self._view(ctx, project_id)
        cycle = await self._cycle(project_id, cycle_id)
        return self._cycle_read(cycle, await repo.cycle_counts(self.db, project_id))

    async def create_cycle(
        self, ctx: AuthContext, project_id: UUID, data: CycleCreate
    ) -> CycleRead:
        await self._use(ctx, project_id)
        cycle = Cycle(
            organization_id=ctx.organization_id,
            project_id=project_id,
            created_by_user_id=ctx.user_id,
            **data.model_dump(),
        )
        self.db.add(cycle)
        await self.db.flush()
        return self._cycle_read(cycle, {})

    async def update_cycle(
        self, ctx: AuthContext, project_id: UUID, cycle_id: UUID, data: CycleUpdate
    ) -> CycleRead:
        await self._use(ctx, project_id)
        cycle = await self._cycle(project_id, cycle_id)
        for field, value in writable(data, over=Cycle).items():
            setattr(cycle, field, value)
        _ordered(cycle.start_date, cycle.end_date)
        await self.db.flush()
        return self._cycle_read(cycle, await repo.cycle_counts(self.db, project_id))

    async def delete_cycle(self, ctx: AuthContext, project_id: UUID, cycle_id: UUID) -> None:
        await self._use(ctx, project_id)
        await self.db.delete(await self._cycle(project_id, cycle_id))
        await self.db.flush()

    # -- modules --------------------------------------------------------------

    async def _module(self, project_id: UUID, module_id: UUID) -> Module:
        module = await repo.get_module(self.db, project_id, module_id)
        if module is None:
            raise NotFoundError(message="Module not found", details={"module_id": module_id})
        return module

    def _module_read(self, module: Module, counts: dict[UUID, tuple[int, int]]) -> ModuleRead:
        total, done = counts.get(module.id, (0, 0))
        read = ModuleRead.model_validate(module, from_attributes=True)
        return read.model_copy(update={"total_items": total, "done_items": done})

    async def list_modules(self, ctx: AuthContext, project_id: UUID) -> list[ModuleRead]:
        await self._view(ctx, project_id)
        counts = await repo.module_counts(self.db, project_id)
        return [self._module_read(m, counts) for m in await repo.list_modules(self.db, project_id)]

    async def get_module(self, ctx: AuthContext, project_id: UUID, module_id: UUID) -> ModuleRead:
        await self._view(ctx, project_id)
        module = await self._module(project_id, module_id)
        return self._module_read(module, await repo.module_counts(self.db, project_id))

    async def create_module(
        self, ctx: AuthContext, project_id: UUID, data: ModuleCreate
    ) -> ModuleRead:
        await self._use(ctx, project_id)
        module = Module(
            organization_id=ctx.organization_id,
            project_id=project_id,
            created_by_user_id=ctx.user_id,
            **data.model_dump(),
        )
        self.db.add(module)
        await self.db.flush()
        return self._module_read(module, {})

    async def update_module(
        self, ctx: AuthContext, project_id: UUID, module_id: UUID, data: ModuleUpdate
    ) -> ModuleRead:
        await self._use(ctx, project_id)
        module = await self._module(project_id, module_id)
        for field, value in writable(data, over=Module).items():
            setattr(module, field, value)
        _ordered(module.start_date, module.target_date)
        await self.db.flush()
        return self._module_read(module, await repo.module_counts(self.db, project_id))

    async def delete_module(self, ctx: AuthContext, project_id: UUID, module_id: UUID) -> None:
        await self._use(ctx, project_id)
        await self.db.delete(await self._module(project_id, module_id))
        await self.db.flush()

    async def add_to_module(
        self, ctx: AuthContext, project_id: UUID, module_id: UUID, item_id: UUID
    ) -> None:
        await self._use(ctx, project_id)
        await self._module(project_id, module_id)
        if await work_item_repo.get(self.db, project_id, item_id) is None:
            raise NotFoundError(message="Work item not found", details={"work_item_id": item_id})
        if not await repo.is_member(self.db, module_id, item_id):
            self.db.add(ModuleWorkItem(module_id=module_id, work_item_id=item_id))
            await self.db.flush()

    async def remove_from_module(
        self, ctx: AuthContext, project_id: UUID, module_id: UUID, item_id: UUID
    ) -> None:
        await self._use(ctx, project_id)
        await self._module(project_id, module_id)
        row = await self.db.get(ModuleWorkItem, (module_id, item_id))
        if row is not None:
            await self.db.delete(row)
            await self.db.flush()
