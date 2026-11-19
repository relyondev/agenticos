"""Saved view and intake routes, nested under a project."""

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import Auth, DBSession
from app.api.public_api import PUBLIC
from app.schemas.intake import (
    IntakeAccept,
    IntakeCreate,
    IntakeDuplicate,
    IntakeList,
    IntakeRead,
    IntakeSnooze,
    IntakeStatus,
    IntakeUpdate,
)
from app.schemas.project_view import (
    ProjectViewCreate,
    ProjectViewList,
    ProjectViewRead,
    ProjectViewUpdate,
)
from app.schemas.work_item import WorkItemList
from app.services.views_intake import IntakeService, ProjectViewService

router = APIRouter(dependencies=[PUBLIC])


def get_view_service(db: DBSession) -> ProjectViewService:
    return ProjectViewService(db)


def get_intake_service(db: DBSession) -> IntakeService:
    return IntakeService(db)


Views = Annotated[ProjectViewService, Depends(get_view_service)]
Intake = Annotated[IntakeService, Depends(get_intake_service)]


@router.get("/{project_id}/views", response_model=ProjectViewList)
async def list_views(project_id: UUID, service: Views, ctx: Auth) -> Any:
    return ProjectViewList(items=await service.list(ctx, project_id))  # ty: ignore[invalid-argument-type]


@router.post(
    "/{project_id}/views", response_model=ProjectViewRead, status_code=status.HTTP_201_CREATED
)
async def create_view(project_id: UUID, data: ProjectViewCreate, service: Views, ctx: Auth) -> Any:
    return await service.create(ctx, project_id, data)


@router.get("/{project_id}/views/{view_id}", response_model=ProjectViewRead)
async def get_view(project_id: UUID, view_id: UUID, service: Views, ctx: Auth) -> Any:
    return await service.get(ctx, project_id, view_id)


@router.patch("/{project_id}/views/{view_id}", response_model=ProjectViewRead)
async def update_view(
    project_id: UUID, view_id: UUID, data: ProjectViewUpdate, service: Views, ctx: Auth
) -> Any:
    return await service.update(ctx, project_id, view_id, data)


@router.delete(
    "/{project_id}/views/{view_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
async def delete_view(project_id: UUID, view_id: UUID, service: Views, ctx: Auth) -> None:
    await service.delete(ctx, project_id, view_id)


@router.get("/{project_id}/views/{view_id}/work-items", response_model=WorkItemList)
async def view_work_items(project_id: UUID, view_id: UUID, service: Views, ctx: Auth) -> Any:
    items, total = await service.work_items(ctx, project_id, view_id)
    return WorkItemList(items=items, total=total)


@router.get("/{project_id}/intake", response_model=IntakeList)
async def list_intake(
    project_id: UUID,
    service: Intake,
    ctx: Auth,
    status_: IntakeStatus | None = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
) -> Any:
    items, total = await service.list(ctx, project_id, status=status_, skip=skip, limit=limit)
    return IntakeList(items=items, total=total)  # ty: ignore[invalid-argument-type]


@router.post("/{project_id}/intake", response_model=IntakeRead, status_code=status.HTTP_201_CREATED)
async def create_intake(project_id: UUID, data: IntakeCreate, service: Intake, ctx: Auth) -> Any:
    return await service.create(ctx, project_id, data)


@router.get("/{project_id}/intake/{request_id}", response_model=IntakeRead)
async def get_intake(project_id: UUID, request_id: UUID, service: Intake, ctx: Auth) -> Any:
    return await service.get(ctx, project_id, request_id)


@router.patch("/{project_id}/intake/{request_id}", response_model=IntakeRead)
async def update_intake(
    project_id: UUID, request_id: UUID, data: IntakeUpdate, service: Intake, ctx: Auth
) -> Any:
    return await service.update(ctx, project_id, request_id, data)


@router.delete(
    "/{project_id}/intake/{request_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
async def delete_intake(project_id: UUID, request_id: UUID, service: Intake, ctx: Auth) -> None:
    await service.delete(ctx, project_id, request_id)


@router.post("/{project_id}/intake/{request_id}/accept", response_model=IntakeRead)
async def accept_intake(
    project_id: UUID, request_id: UUID, data: IntakeAccept, service: Intake, ctx: Auth
) -> Any:
    return await service.accept(ctx, project_id, request_id, data)


@router.post("/{project_id}/intake/{request_id}/decline", response_model=IntakeRead)
async def decline_intake(project_id: UUID, request_id: UUID, service: Intake, ctx: Auth) -> Any:
    return await service.decline(ctx, project_id, request_id)


@router.post("/{project_id}/intake/{request_id}/snooze", response_model=IntakeRead)
async def snooze_intake(
    project_id: UUID, request_id: UUID, data: IntakeSnooze, service: Intake, ctx: Auth
) -> Any:
    return await service.snooze(ctx, project_id, request_id, data)


@router.post("/{project_id}/intake/{request_id}/duplicate", response_model=IntakeRead)
async def duplicate_intake(
    project_id: UUID, request_id: UUID, data: IntakeDuplicate, service: Intake, ctx: Auth
) -> Any:
    return await service.duplicate(ctx, project_id, request_id, data)
