"""Work item routes, nested under a project: `/projects/{project_id}/work-items`."""

from datetime import date
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import Auth, DBSession
from app.api.public_api import PUBLIC
from app.schemas.work_item import (
    ActivityRead,
    CommentCreate,
    CommentRead,
    Priority,
    State,
    WorkItemCreate,
    WorkItemList,
    WorkItemRead,
    WorkItemUpdate,
)
from app.services.work_item import WorkItemService

router = APIRouter(dependencies=[PUBLIC])


def get_service(db: DBSession) -> WorkItemService:
    return WorkItemService(db)


Svc = Annotated[WorkItemService, Depends(get_service)]


@router.get("/{project_id}/work-items", response_model=WorkItemList)
async def list_work_items(
    project_id: UUID,
    service: Svc,
    ctx: Auth,
    state: State | None = None,
    priority: Priority | None = None,
    assignee_user_id: UUID | None = None,
    label: str | None = Query(None, max_length=100),
    cycle_id: UUID | None = None,
    module_id: UUID | None = None,
    due_before: date | None = None,
    q: str | None = Query(None, max_length=100),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
) -> Any:
    items, total = await service.list(
        ctx,
        project_id,
        state=state,
        priority=priority,
        assignee_user_id=assignee_user_id,
        label=label,
        cycle_id=cycle_id,
        module_id=module_id,
        due_before=due_before,
        search=q,
        skip=skip,
        limit=limit,
    )
    return WorkItemList(items=items, total=total)  # ty: ignore[invalid-argument-type]


@router.post(
    "/{project_id}/work-items", response_model=WorkItemRead, status_code=status.HTTP_201_CREATED
)
async def create_work_item(project_id: UUID, data: WorkItemCreate, service: Svc, ctx: Auth) -> Any:
    return await service.create(ctx, project_id, data)


@router.get("/{project_id}/work-items/{item_id}", response_model=WorkItemRead)
async def get_work_item(project_id: UUID, item_id: UUID, service: Svc, ctx: Auth) -> Any:
    return await service.get(ctx, project_id, item_id)


@router.patch("/{project_id}/work-items/{item_id}", response_model=WorkItemRead)
async def update_work_item(
    project_id: UUID, item_id: UUID, data: WorkItemUpdate, service: Svc, ctx: Auth
) -> Any:
    return await service.update(ctx, project_id, item_id, data)


@router.delete(
    "/{project_id}/work-items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_work_item(project_id: UUID, item_id: UUID, service: Svc, ctx: Auth) -> None:
    await service.delete(ctx, project_id, item_id)


@router.get("/{project_id}/work-items/{item_id}/comments", response_model=list[CommentRead])
async def list_comments(project_id: UUID, item_id: UUID, service: Svc, ctx: Auth) -> Any:
    return await service.comments(ctx, project_id, item_id)


@router.post(
    "/{project_id}/work-items/{item_id}/comments",
    response_model=CommentRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_comment(
    project_id: UUID, item_id: UUID, data: CommentCreate, service: Svc, ctx: Auth
) -> Any:
    return await service.comment(ctx, project_id, item_id, data)


@router.get("/{project_id}/work-items/{item_id}/activity", response_model=list[ActivityRead])
async def list_activity(project_id: UUID, item_id: UUID, service: Svc, ctx: Auth) -> Any:
    return await service.activities(ctx, project_id, item_id)
