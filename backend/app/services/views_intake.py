"""Saved views and intake: who may touch them and what a decision does.

Both follow the project's access, as work items do. Accepting an intake request
creates the work item through :class:`WorkItemService`, so a request becomes a
numbered item with the same rules and activity as one made by hand.
"""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, NotFoundError
from app.core.permissions import AuthContext, Perm
from app.db.models.planning import IntakeRequest, ProjectView
from app.db.updates import writable
from app.repositories import views_intake as repo
from app.repositories import work_item as work_item_repo
from app.schemas.intake import (
    IntakeAccept,
    IntakeCreate,
    IntakeDuplicate,
    IntakeSnooze,
    IntakeUpdate,
)
from app.schemas.project_view import ProjectViewCreate, ProjectViewUpdate, ViewFilters
from app.schemas.work_item import WorkItemCreate
from app.services.project import ProjectService
from app.services.work_item import WorkItemService


class ProjectViewService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.projects = ProjectService(db)
        self.items = WorkItemService(db)

    async def _view(self, project_id: UUID, view_id: UUID) -> ProjectView:
        view = await repo.get_view(self.db, project_id, view_id)
        if view is None:
            raise NotFoundError(message="View not found", details={"view_id": view_id})
        return view

    async def list(self, ctx: AuthContext, project_id: UUID) -> list[ProjectView]:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_VIEW)
        return await repo.list_views(self.db, project_id)

    async def get(self, ctx: AuthContext, project_id: UUID, view_id: UUID) -> ProjectView:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_VIEW)
        return await self._view(project_id, view_id)

    async def create(
        self, ctx: AuthContext, project_id: UUID, data: ProjectViewCreate
    ) -> ProjectView:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        view = ProjectView(
            organization_id=ctx.organization_id,
            project_id=project_id,
            created_by_user_id=ctx.user_id,
            name=data.name,
            description=data.description,
            filters=data.filters.model_dump(mode="json", exclude_none=True),
        )
        self.db.add(view)
        await self.db.flush()
        return view

    async def update(
        self, ctx: AuthContext, project_id: UUID, view_id: UUID, data: ProjectViewUpdate
    ) -> ProjectView:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        view = await self._view(project_id, view_id)
        changes = writable(data, over=ProjectView, exclude={"filters"})
        for field, value in changes.items():
            setattr(view, field, value)
        if data.filters is not None:
            view.filters = data.filters.model_dump(mode="json", exclude_none=True)
        await self.db.flush()
        return view

    async def delete(self, ctx: AuthContext, project_id: UUID, view_id: UUID) -> None:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        await self.db.delete(await self._view(project_id, view_id))
        await self.db.flush()

    async def work_items(self, ctx: AuthContext, project_id: UUID, view_id: UUID):
        """The work items a view's filters match, as the view's owner would see them."""
        view = await self.get(ctx, project_id, view_id)
        filters = ViewFilters.model_validate(view.filters)
        return await self.items.list(
            ctx,
            project_id,
            state=filters.state,
            priority=filters.priority,
            assignee_user_id=filters.assignee_user_id,
            label=filters.label,
            cycle_id=filters.cycle_id,
            module_id=filters.module_id,
            due_before=filters.due_before,
            search=filters.q,
            skip=0,
            limit=200,
        )


class IntakeService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.projects = ProjectService(db)
        self.items = WorkItemService(db)

    async def _request(self, project_id: UUID, request_id: UUID) -> IntakeRequest:
        request = await repo.get_request(self.db, project_id, request_id)
        if request is None:
            raise NotFoundError(message="Request not found", details={"request_id": request_id})
        return request

    @staticmethod
    def _open(request: IntakeRequest) -> None:
        if request.status == "accepted":
            raise BadRequestError(message="An accepted request is already a work item")

    def _decide(self, ctx: AuthContext, request: IntakeRequest, status: str) -> None:
        request.status = status
        request.decided_by_user_id = ctx.user_id
        request.decided_at = datetime.now(UTC)
        if status != "snoozed":
            request.snoozed_until = None

    async def list(self, ctx: AuthContext, project_id: UUID, **filters):
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_VIEW)
        return await repo.list_requests(self.db, project_id, **filters)

    async def get(self, ctx: AuthContext, project_id: UUID, request_id: UUID) -> IntakeRequest:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_VIEW)
        return await self._request(project_id, request_id)

    async def create(self, ctx: AuthContext, project_id: UUID, data: IntakeCreate) -> IntakeRequest:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        request = IntakeRequest(
            organization_id=ctx.organization_id,
            project_id=project_id,
            requested_by_user_id=ctx.user_id,
            **data.model_dump(),
        )
        self.db.add(request)
        await self.db.flush()
        return request

    async def update(
        self, ctx: AuthContext, project_id: UUID, request_id: UUID, data: IntakeUpdate
    ) -> IntakeRequest:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        request = await self._request(project_id, request_id)
        self._open(request)
        for field, value in writable(data, over=IntakeRequest).items():
            setattr(request, field, value)
        await self.db.flush()
        return request

    async def delete(self, ctx: AuthContext, project_id: UUID, request_id: UUID) -> None:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        await self.db.delete(await self._request(project_id, request_id))
        await self.db.flush()

    async def accept(
        self, ctx: AuthContext, project_id: UUID, request_id: UUID, data: IntakeAccept
    ) -> IntakeRequest:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        request = await self._request(project_id, request_id)
        self._open(request)
        item = await self.items.create(
            ctx,
            project_id,
            WorkItemCreate(
                name=request.name,
                description=request.description,
                priority=data.priority or request.priority,  # ty: ignore[invalid-argument-type]
                assignee_user_id=data.assignee_user_id,
                cycle_id=data.cycle_id,
            ),
        )
        request.work_item_id = item.id
        self._decide(ctx, request, "accepted")
        await self.db.flush()
        return request

    async def decline(self, ctx: AuthContext, project_id: UUID, request_id: UUID) -> IntakeRequest:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        request = await self._request(project_id, request_id)
        self._open(request)
        self._decide(ctx, request, "declined")
        await self.db.flush()
        return request

    async def snooze(
        self, ctx: AuthContext, project_id: UUID, request_id: UUID, data: IntakeSnooze
    ) -> IntakeRequest:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        request = await self._request(project_id, request_id)
        self._open(request)
        if data.until <= datetime.now(UTC).date():
            raise BadRequestError(message="Snooze until a future date")
        self._decide(ctx, request, "snoozed")
        request.snoozed_until = data.until
        await self.db.flush()
        return request

    async def duplicate(
        self, ctx: AuthContext, project_id: UUID, request_id: UUID, data: IntakeDuplicate
    ) -> IntakeRequest:
        await self.projects.get(ctx, project_id, perm=Perm.PROJECTS_USE)
        request = await self._request(project_id, request_id)
        self._open(request)
        if await work_item_repo.get(self.db, project_id, data.work_item_id) is None:
            raise NotFoundError(
                message="Work item not found", details={"work_item_id": data.work_item_id}
            )
        request.work_item_id = data.work_item_id
        self._decide(ctx, request, "duplicate")
        await self.db.flush()
        return request
