"""Cycles and modules: data access. Who may see the project is the service's call."""

from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.planning import Cycle, Module, ModuleWorkItem
from app.db.models.work_item import WorkItem


async def get_cycle(db: AsyncSession, project_id: UUID, cycle_id: UUID) -> Cycle | None:
    result = await db.execute(
        select(Cycle).where(Cycle.project_id == project_id, Cycle.id == cycle_id)
    )
    return result.scalar_one_or_none()


async def list_cycles(db: AsyncSession, project_id: UUID) -> list[Cycle]:
    result = await db.execute(
        select(Cycle).where(Cycle.project_id == project_id).order_by(Cycle.start_date, Cycle.name)
    )
    return list(result.scalars().all())


async def cycle_counts(db: AsyncSession, project_id: UUID) -> dict[UUID, tuple[int, int]]:
    done = func.coalesce(func.sum(case((WorkItem.state == "done", 1), else_=0)), 0)
    rows = await db.execute(
        select(WorkItem.cycle_id, func.count(), done)
        .where(WorkItem.project_id == project_id, WorkItem.cycle_id.is_not(None))
        .group_by(WorkItem.cycle_id)
    )
    return {cycle: (int(total), int(finished)) for cycle, total, finished in rows.all()}


async def get_module(db: AsyncSession, project_id: UUID, module_id: UUID) -> Module | None:
    result = await db.execute(
        select(Module).where(Module.project_id == project_id, Module.id == module_id)
    )
    return result.scalar_one_or_none()


async def list_modules(db: AsyncSession, project_id: UUID) -> list[Module]:
    result = await db.execute(
        select(Module).where(Module.project_id == project_id).order_by(Module.name)
    )
    return list(result.scalars().all())


async def module_counts(db: AsyncSession, project_id: UUID) -> dict[UUID, tuple[int, int]]:
    done = func.coalesce(func.sum(case((WorkItem.state == "done", 1), else_=0)), 0)
    rows = await db.execute(
        select(ModuleWorkItem.module_id, func.count(), done)
        .join(WorkItem, WorkItem.id == ModuleWorkItem.work_item_id)
        .where(WorkItem.project_id == project_id)
        .group_by(ModuleWorkItem.module_id)
    )
    return {module: (int(total), int(finished)) for module, total, finished in rows.all()}


async def module_ids_for(db: AsyncSession, item_ids: list[UUID]) -> dict[UUID, list[UUID]]:
    if not item_ids:
        return {}
    rows = await db.execute(
        select(ModuleWorkItem.work_item_id, ModuleWorkItem.module_id).where(
            ModuleWorkItem.work_item_id.in_(item_ids)
        )
    )
    found: dict[UUID, list[UUID]] = {}
    for item, module in rows.all():
        found.setdefault(item, []).append(module)
    return found


async def is_member(db: AsyncSession, module_id: UUID, item_id: UUID) -> bool:
    result = await db.execute(
        select(ModuleWorkItem).where(
            ModuleWorkItem.module_id == module_id, ModuleWorkItem.work_item_id == item_id
        )
    )
    return result.scalar_one_or_none() is not None
