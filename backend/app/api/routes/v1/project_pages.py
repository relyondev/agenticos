"""Page routes, nested under a project: `/projects/{project_id}/pages`."""

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import Auth, DBSession
from app.api.public_api import PUBLIC
from app.schemas.project_page import (
    PageCreate,
    PageList,
    PageRead,
    PageUpdate,
    PageVersionRead,
    PageVersionSummary,
)
from app.services.project_page import PageService

router = APIRouter(dependencies=[PUBLIC])


def get_service(db: DBSession) -> PageService:
    return PageService(db)


Svc = Annotated[PageService, Depends(get_service)]


@router.get("/{project_id}/pages", response_model=PageList)
async def list_pages(
    project_id: UUID,
    service: Svc,
    ctx: Auth,
    archived: bool = False,
    q: str | None = Query(None, max_length=100),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
) -> Any:
    items, total = await service.list(
        ctx, project_id, archived=archived, search=q, skip=skip, limit=limit
    )
    return PageList(items=items, total=total)  # ty: ignore[invalid-argument-type]


@router.post("/{project_id}/pages", response_model=PageRead, status_code=status.HTTP_201_CREATED)
async def create_page(project_id: UUID, data: PageCreate, service: Svc, ctx: Auth) -> Any:
    return await service.create(ctx, project_id, data)


@router.get("/{project_id}/pages/{page_id}", response_model=PageRead)
async def get_page(project_id: UUID, page_id: UUID, service: Svc, ctx: Auth) -> Any:
    return await service.get(ctx, project_id, page_id)


@router.patch("/{project_id}/pages/{page_id}", response_model=PageRead)
async def update_page(
    project_id: UUID, page_id: UUID, data: PageUpdate, service: Svc, ctx: Auth
) -> Any:
    return await service.update(ctx, project_id, page_id, data)


@router.delete(
    "/{project_id}/pages/{page_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
async def delete_page(project_id: UUID, page_id: UUID, service: Svc, ctx: Auth) -> None:
    await service.delete(ctx, project_id, page_id)


@router.post("/{project_id}/pages/{page_id}/lock", response_model=PageRead)
async def lock_page(project_id: UUID, page_id: UUID, service: Svc, ctx: Auth) -> Any:
    return await service.set_lock(ctx, project_id, page_id, locked=True)


@router.post("/{project_id}/pages/{page_id}/unlock", response_model=PageRead)
async def unlock_page(project_id: UUID, page_id: UUID, service: Svc, ctx: Auth) -> Any:
    return await service.set_lock(ctx, project_id, page_id, locked=False)


@router.post("/{project_id}/pages/{page_id}/archive", response_model=PageRead)
async def archive_page(project_id: UUID, page_id: UUID, service: Svc, ctx: Auth) -> Any:
    return await service.set_archived(ctx, project_id, page_id, archived=True)


@router.post("/{project_id}/pages/{page_id}/unarchive", response_model=PageRead)
async def unarchive_page(project_id: UUID, page_id: UUID, service: Svc, ctx: Auth) -> Any:
    return await service.set_archived(ctx, project_id, page_id, archived=False)


@router.get("/{project_id}/pages/{page_id}/versions", response_model=list[PageVersionSummary])
async def list_versions(project_id: UUID, page_id: UUID, service: Svc, ctx: Auth) -> Any:
    return await service.versions(ctx, project_id, page_id)


@router.get("/{project_id}/pages/{page_id}/versions/{version_id}", response_model=PageVersionRead)
async def get_version(
    project_id: UUID, page_id: UUID, version_id: UUID, service: Svc, ctx: Auth
) -> Any:
    return await service.version(ctx, project_id, page_id, version_id)


@router.post("/{project_id}/pages/{page_id}/versions/{version_id}/restore", response_model=PageRead)
async def restore_version(
    project_id: UUID, page_id: UUID, version_id: UUID, service: Svc, ctx: Auth
) -> Any:
    return await service.restore(ctx, project_id, page_id, version_id)
