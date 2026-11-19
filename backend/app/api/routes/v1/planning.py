"""Cycle and module routes, nested under a project."""

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.deps import Auth, DBSession
from app.api.public_api import PUBLIC
from app.schemas.planning import (
    CycleCreate,
    CycleList,
    CycleRead,
    CycleUpdate,
    ModuleCreate,
    ModuleList,
    ModuleRead,
    ModuleUpdate,
)
from app.services.planning import PlanningService

router = APIRouter(dependencies=[PUBLIC])


def get_service(db: DBSession) -> PlanningService:
    return PlanningService(db)


Svc = Annotated[PlanningService, Depends(get_service)]


@router.get("/{project_id}/cycles", response_model=CycleList)
async def list_cycles(project_id: UUID, service: Svc, ctx: Auth) -> Any:
    return CycleList(items=await service.list_cycles(ctx, project_id))


@router.post("/{project_id}/cycles", response_model=CycleRead, status_code=status.HTTP_201_CREATED)
async def create_cycle(project_id: UUID, data: CycleCreate, service: Svc, ctx: Auth) -> Any:
    return await service.create_cycle(ctx, project_id, data)


@router.get("/{project_id}/cycles/{cycle_id}", response_model=CycleRead)
async def get_cycle(project_id: UUID, cycle_id: UUID, service: Svc, ctx: Auth) -> Any:
    return await service.get_cycle(ctx, project_id, cycle_id)


@router.patch("/{project_id}/cycles/{cycle_id}", response_model=CycleRead)
async def update_cycle(
    project_id: UUID, cycle_id: UUID, data: CycleUpdate, service: Svc, ctx: Auth
) -> Any:
    return await service.update_cycle(ctx, project_id, cycle_id, data)


@router.delete(
    "/{project_id}/cycles/{cycle_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
async def delete_cycle(project_id: UUID, cycle_id: UUID, service: Svc, ctx: Auth) -> None:
    await service.delete_cycle(ctx, project_id, cycle_id)


@router.get("/{project_id}/modules", response_model=ModuleList)
async def list_modules(project_id: UUID, service: Svc, ctx: Auth) -> Any:
    return ModuleList(items=await service.list_modules(ctx, project_id))


@router.post(
    "/{project_id}/modules", response_model=ModuleRead, status_code=status.HTTP_201_CREATED
)
async def create_module(project_id: UUID, data: ModuleCreate, service: Svc, ctx: Auth) -> Any:
    return await service.create_module(ctx, project_id, data)


@router.get("/{project_id}/modules/{module_id}", response_model=ModuleRead)
async def get_module(project_id: UUID, module_id: UUID, service: Svc, ctx: Auth) -> Any:
    return await service.get_module(ctx, project_id, module_id)


@router.patch("/{project_id}/modules/{module_id}", response_model=ModuleRead)
async def update_module(
    project_id: UUID, module_id: UUID, data: ModuleUpdate, service: Svc, ctx: Auth
) -> Any:
    return await service.update_module(ctx, project_id, module_id, data)


@router.delete(
    "/{project_id}/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
async def delete_module(project_id: UUID, module_id: UUID, service: Svc, ctx: Auth) -> None:
    await service.delete_module(ctx, project_id, module_id)


@router.put(
    "/{project_id}/modules/{module_id}/work-items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def add_to_module(
    project_id: UUID, module_id: UUID, item_id: UUID, service: Svc, ctx: Auth
) -> None:
    await service.add_to_module(ctx, project_id, module_id, item_id)


@router.delete(
    "/{project_id}/modules/{module_id}/work-items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def remove_from_module(
    project_id: UUID, module_id: UUID, item_id: UUID, service: Svc, ctx: Auth
) -> None:
    await service.remove_from_module(ctx, project_id, module_id, item_id)
