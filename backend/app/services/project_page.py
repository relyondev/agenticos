"""Pages: who may write one and what keeps two editors from overwriting each other.

A page follows its project's access. Every change to the name or content must name
the revision it was made against; a stale revision is a conflict, so the second
editor is told rather than silently winning. Each revision is kept as a version,
and an earlier one can be restored as a new revision. A locked page refuses edits
until its owner unlocks it, and a page is archived before it can be deleted, as
in Plane.
"""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, BadRequestError, ConflictError, NotFoundError
from app.core.permissions import AuthContext, Perm
from app.db.models.planning import ProjectPage, ProjectPageVersion
from app.db.updates import writable
from app.repositories import project_page as repo
from app.schemas.project_page import PageCreate, PageUpdate
from app.services.project import ProjectService


class PageService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.projects = ProjectService(db)

    async def _page(self, project_id: UUID, page_id: UUID, *, lock: bool = False) -> ProjectPage:
        page = await repo.get(self.db, project_id, page_id, for_update=lock)
        if page is None:
            raise NotFoundError(message="Page not found", details={"page_id": page_id})
        return page

    def _snapshot(self, ctx: AuthContext, page: ProjectPage) -> None:
        self.db.add(
            ProjectPageVersion(
                page_id=page.id,
                revision=page.revision,
                name=page.name,
                content=page.content,
                edited_by_user_id=ctx.user_id,
            )
        )

    @staticmethod
    def _writable(page: ProjectPage) -> None:
        if page.archived_at is not None:
            raise BadRequestError(message="Restore the page from the archive before editing it")
        if page.is_locked:
            raise BadRequestError(message="The page is locked")

    async def list(self, ctx: AuthContext, project_id: UUID, **filters):
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_VIEW)
        return await repo.list_pages(self.db, project_id, **filters)

    async def get(self, ctx: AuthContext, project_id: UUID, page_id: UUID) -> ProjectPage:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_VIEW)
        return await self._page(project_id, page_id)

    async def create(self, ctx: AuthContext, project_id: UUID, data: PageCreate) -> ProjectPage:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        page = ProjectPage(
            organization_id=ctx.organization_id,
            project_id=project_id,
            owned_by_user_id=ctx.user_id,
            last_edited_by_user_id=ctx.user_id,
            revision=1,
            **data.model_dump(),
        )
        self.db.add(page)
        await self.db.flush()
        self._snapshot(ctx, page)
        await self.db.flush()
        return page

    async def update(
        self, ctx: AuthContext, project_id: UUID, page_id: UUID, data: PageUpdate
    ) -> ProjectPage:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        page = await self._page(project_id, page_id, lock=True)
        self._writable(page)
        if data.revision != page.revision:
            raise ConflictError(
                message="Someone else changed this page. Reload it to see their changes.",
                details={"current_revision": page.revision},
            )
        changes = writable(data, over=ProjectPage, exclude={"revision"})
        if not any(getattr(page, k) != v for k, v in changes.items()):
            return page
        for field, value in changes.items():
            setattr(page, field, value)
        page.revision += 1
        page.last_edited_by_user_id = ctx.user_id
        self._snapshot(ctx, page)
        await self.db.flush()
        await repo.prune_versions(self.db, page.id)
        return page

    async def set_lock(
        self, ctx: AuthContext, project_id: UUID, page_id: UUID, *, locked: bool
    ) -> ProjectPage:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        page = await self._page(project_id, page_id, lock=True)
        if page.owned_by_user_id is not None and page.owned_by_user_id != ctx.user_id:
            raise AuthorizationError(message="Only the page's owner can lock or unlock it")
        page.is_locked = locked
        await self.db.flush()
        return page

    async def set_archived(
        self, ctx: AuthContext, project_id: UUID, page_id: UUID, *, archived: bool
    ) -> ProjectPage:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        page = await self._page(project_id, page_id, lock=True)
        page.archived_at = datetime.now(UTC) if archived else None
        await self.db.flush()
        return page

    async def delete(self, ctx: AuthContext, project_id: UUID, page_id: UUID) -> None:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        page = await self._page(project_id, page_id)
        if page.archived_at is None:
            raise BadRequestError(message="Archive the page before deleting it")
        await self.db.delete(page)
        await self.db.flush()

    async def versions(self, ctx: AuthContext, project_id: UUID, page_id: UUID):
        await self.get(ctx, project_id, page_id)
        return await repo.versions(self.db, page_id)

    async def version(
        self, ctx: AuthContext, project_id: UUID, page_id: UUID, version_id: UUID
    ) -> ProjectPageVersion:
        await self.get(ctx, project_id, page_id)
        found = await repo.get_version(self.db, page_id, version_id)
        if found is None:
            raise NotFoundError(message="Version not found", details={"version_id": version_id})
        return found

    async def restore(
        self, ctx: AuthContext, project_id: UUID, page_id: UUID, version_id: UUID
    ) -> ProjectPage:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        page = await self._page(project_id, page_id, lock=True)
        self._writable(page)
        found = await repo.get_version(self.db, page_id, version_id)
        if found is None:
            raise NotFoundError(message="Version not found", details={"version_id": version_id})
        page.name, page.content = found.name, found.content
        page.revision += 1
        page.last_edited_by_user_id = ctx.user_id
        self._snapshot(ctx, page)
        await self.db.flush()
        await repo.prune_versions(self.db, page.id)
        return page
