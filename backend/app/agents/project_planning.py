"""The tools an agent has for a project's planning: work items, cycles, modules, intake, pages.

An agent that answers in a project works on what the project's people work on: it
reads the work items, files and updates them, writes the pages, and puts a request
in intake for the people to decide. Everything goes through the same services the
project's own screens use, so the same rules hold - numbering, the activity trail,
the revision check on a page - and the activity trail names the person the run is
for.

Authorisation happened when the run started (`ProjectService.for_run` checked that
this caller may use this project), so the services here are given a gate that only
confirms the project is the run's own. They do not take the project's row lock again:
the run's own session may still hold it, and a tool that waited on its own caller
would never return.

Each call opens a short session of its own and commits on the way out, which is the
shape a tool needs: nothing it did is half-written when the model moves on.

Intake is deliberately create-only. An agent files a request; accepting or declining
one is a decision for the project's people.
"""

import logging
from collections.abc import Awaitable, Callable
from datetime import date
from typing import Any
from uuid import UUID

from pydantic_ai.toolsets import FunctionToolset
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.core.permissions import AuthContext, Perm
from app.db.models.work_item import WorkItem
from app.db.session import get_db_context
from app.repositories import work_item as work_item_repo
from app.schemas.intake import IntakeCreate
from app.schemas.project_page import PageCreate, PageUpdate
from app.schemas.work_item import CommentCreate, WorkItemCreate, WorkItemUpdate
from app.services.planning import PlanningService
from app.services.project_page import PageService
from app.services.views_intake import IntakeService
from app.services.work_item import WorkItemService

logger = logging.getLogger(__name__)

LIST_LIMIT = 50
"""How many rows a list call returns: enough to orient, not a transcript's worth."""

PREVIEW = 300
"""How much of a description a list line carries."""

SessionFactory = Callable[[], Any]


class _RunsProject:
    """The gate a run's tools pass: the project is the one the run was authorised for."""

    def __init__(self, project_id: UUID) -> None:
        self.project_id = project_id

    async def get(self, ctx: AuthContext, project_id: UUID, *, perm: Perm = Perm.PROJECTS_VIEW):
        if project_id != self.project_id:
            raise AppException(message="That is not this chat's project")


def _clip(text: str, n: int = PREVIEW) -> str:
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1] + "…"


def _line(item: WorkItem) -> str:
    bits = [item.state, *([item.priority] if item.priority != "none" else [])]
    if item.target_date:
        bits.append(f"due {item.target_date}")
    if item.labels:
        bits.append("labels " + ",".join(item.labels))
    return f"#{item.sequence_id} [{' | '.join(bits)}] {item.name}"


def _date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def project_planning_toolset(
    project_id: UUID, ctx: AuthContext, *, session: SessionFactory = get_db_context
) -> FunctionToolset:
    """The planning tools for one project, acting as the person `ctx` is."""
    toolset = FunctionToolset()
    gate = _RunsProject(project_id)

    async def run(work: Callable[[AsyncSession], Awaitable[str]]) -> str:
        """Run one call in a session of its own; a refusal becomes the answer, not a crash."""
        try:
            async with session() as db:
                return await work(db)
        except AppException as refusal:
            return f"Not done: {refusal.message}"
        except ValueError as invalid:
            return f"Not done: {invalid}"

    def items(db: AsyncSession) -> WorkItemService:
        service = WorkItemService(db)
        service.projects = gate  # ty: ignore[invalid-assignment]
        return service

    def planning(db: AsyncSession) -> PlanningService:
        service = PlanningService(db)
        service.projects = gate  # ty: ignore[invalid-assignment]
        return service

    def intake(db: AsyncSession) -> IntakeService:
        service = IntakeService(db)
        service.projects = gate  # ty: ignore[invalid-assignment]
        return service

    def pages(db: AsyncSession) -> PageService:
        service = PageService(db)
        service.projects = gate  # ty: ignore[invalid-assignment]
        return service

    async def by_number(db: AsyncSession, number: int) -> WorkItem:
        item = await work_item_repo.get_by_sequence(db, project_id, number)
        if item is None:
            raise ValueError(f"There is no work item #{number} in this project")
        return item

    @toolset.tool_plain
    async def project_list_work_items(
        state: str | None = None,
        priority: str | None = None,
        query: str | None = None,
        cycle_id: str | None = None,
        module_id: str | None = None,
    ) -> str:
        """List this project's work items as `#number [state | priority | due] title`.

        Filter by `state` (backlog, todo, in_progress, done, cancelled), `priority`
        (urgent, high, medium, low, none), a text `query`, or a `cycle_id` / `module_id`
        from project_list_cycles / project_list_modules.
        """

        async def work(db: AsyncSession) -> str:
            found, total = await items(db).list(
                ctx,
                project_id,
                state=state,
                priority=priority,
                search=query,
                cycle_id=UUID(cycle_id) if cycle_id else None,
                module_id=UUID(module_id) if module_id else None,
                skip=0,
                limit=LIST_LIMIT,
            )
            if not found:
                return "No work items match."
            head = f"{len(found)} of {total} work items:\n"
            return head + "\n".join(_line(i) for i in found)

        return await run(work)

    @toolset.tool_plain
    async def project_get_work_item(number: int) -> str:
        """Read one work item by its number (`#12` is 12): its fields, description and comments."""

        async def work(db: AsyncSession) -> str:
            item = await by_number(db, number)
            service = items(db)
            comments = await service.comments(ctx, project_id, item.id)
            body = [
                _line(item),
                f"id: {item.id}",
                f"cycle: {item.cycle_id or 'none'}",
                f"start: {item.start_date or '-'}  due: {item.target_date or '-'}",
                "",
                item.description or "(no description)",
            ]
            if comments:
                body += ["", "Comments:"]
                body += [f"- {_clip(c.body, 500)}" for c in comments[-10:]]
            return "\n".join(body)

        return await run(work)

    @toolset.tool_plain
    async def project_create_work_item(
        name: str,
        description: str = "",
        priority: str = "none",
        state: str = "backlog",
        due_date: str | None = None,
    ) -> str:
        """Create a work item in this project; returns its number. `due_date` is YYYY-MM-DD."""

        async def work(db: AsyncSession) -> str:
            item = await items(db).create(
                ctx,
                project_id,
                WorkItemCreate(
                    name=name,
                    description=description,
                    priority=priority,  # ty: ignore[invalid-argument-type]
                    state=state,  # ty: ignore[invalid-argument-type]
                    target_date=_date(due_date),
                ),
            )
            return f"Created #{item.sequence_id}: {item.name}"

        return await run(work)

    @toolset.tool_plain
    async def project_update_work_item(
        number: int,
        name: str | None = None,
        description: str | None = None,
        state: str | None = None,
        priority: str | None = None,
        due_date: str | None = None,
        cycle_id: str | None = None,
    ) -> str:
        """Change a work item by number. Only the fields you pass change; the change is recorded in its activity."""

        async def work(db: AsyncSession) -> str:
            item = await by_number(db, number)
            fields: dict[str, Any] = {
                key: value
                for key, value in {
                    "name": name,
                    "description": description,
                    "state": state,
                    "priority": priority,
                }.items()
                if value is not None
            }
            if due_date is not None:
                fields["target_date"] = _date(due_date)
            if cycle_id is not None:
                fields["cycle_id"] = UUID(cycle_id)
            if not fields:
                return "Nothing to change."
            changed = await items(db).update(
                ctx, project_id, item.id, WorkItemUpdate.model_validate(fields)
            )
            return f"Updated {_line(changed)}"

        return await run(work)

    @toolset.tool_plain
    async def project_comment_on_work_item(number: int, text: str) -> str:
        """Add a comment to a work item by number."""

        async def work(db: AsyncSession) -> str:
            item = await by_number(db, number)
            await items(db).comment(ctx, project_id, item.id, CommentCreate(body=text))
            return f"Commented on #{number}."

        return await run(work)

    @toolset.tool_plain
    async def project_list_cycles() -> str:
        """List the project's cycles (time-boxed periods) with their dates, status, progress and id."""

        async def work(db: AsyncSession) -> str:
            cycles = await planning(db).list_cycles(ctx, project_id)
            if not cycles:
                return "No cycles."
            return "\n".join(
                f"{c.name} [{c.status}] {c.start_date or '?'} → {c.end_date or '?'} "
                f"· {c.done_items}/{c.total_items} done · id {c.id}"
                for c in cycles
            )

        return await run(work)

    @toolset.tool_plain
    async def project_list_modules() -> str:
        """List the project's modules (features or goals) with status, progress and id."""

        async def work(db: AsyncSession) -> str:
            modules = await planning(db).list_modules(ctx, project_id)
            if not modules:
                return "No modules."
            return "\n".join(
                f"{m.name} [{m.status}] · {m.done_items}/{m.total_items} done · id {m.id}"
                for m in modules
            )

        return await run(work)

    @toolset.tool_plain
    async def project_list_intake(status: str | None = "pending") -> str:
        """List intake requests (default: pending), newest first. `status`: pending, accepted, declined, snoozed, duplicate."""

        async def work(db: AsyncSession) -> str:
            found, total = await intake(db).list(
                ctx, project_id, status=status, skip=0, limit=LIST_LIMIT
            )
            if not found:
                return "No requests."
            return f"{len(found)} of {total} requests:\n" + "\n".join(
                f"[{r.status}{' | ' + r.priority if r.priority != 'none' else ''}] {r.name}"
                f" — {_clip(r.description, 120)}"
                for r in found
            )

        return await run(work)

    @toolset.tool_plain
    async def project_file_intake_request(
        name: str, description: str = "", priority: str = "none"
    ) -> str:
        """File a request in the project's intake for its people to review.

        You cannot accept or decline requests; that decision belongs to the project's
        people. Use this to propose work rather than creating a work item directly
        when the person has not asked you to.
        """

        async def work(db: AsyncSession) -> str:
            request = await intake(db).create(
                ctx,
                project_id,
                IntakeCreate(name=name, description=description, priority=priority),  # ty: ignore[invalid-argument-type]
            )
            return f"Filed request: {request.name} (pending review)"

        return await run(work)

    @toolset.tool_plain
    async def project_list_pages(query: str | None = None) -> str:
        """List the project's pages (shared documents) with id and revision; `query` matches title or text."""

        async def work(db: AsyncSession) -> str:
            found, total = await pages(db).list(
                ctx, project_id, archived=False, search=query, skip=0, limit=LIST_LIMIT
            )
            if not found:
                return "No pages."
            return f"{len(found)} of {total} pages:\n" + "\n".join(
                f"{p.name}{' [locked]' if p.is_locked else ''} · revision {p.revision} · id {p.id}"
                for p in found
            )

        return await run(work)

    @toolset.tool_plain
    async def project_read_page(page_id: str) -> str:
        """Read a page by id: its revision (needed to edit it) and its Markdown content."""

        async def work(db: AsyncSession) -> str:
            page = await pages(db).get(ctx, project_id, UUID(page_id))
            lock = " (locked: it cannot be edited)" if page.is_locked else ""
            return f"{page.name} — revision {page.revision}{lock}\n\n{page.content}"

        return await run(work)

    @toolset.tool_plain
    async def project_create_page(name: str, content: str = "") -> str:
        """Create a page (Markdown) in the project; returns its id and revision."""

        async def work(db: AsyncSession) -> str:
            page = await pages(db).create(ctx, project_id, PageCreate(name=name, content=content))
            return f"Created page {page.name} · id {page.id} · revision {page.revision}"

        return await run(work)

    @toolset.tool_plain
    async def project_edit_page(
        page_id: str, revision: int, content: str | None = None, name: str | None = None
    ) -> str:
        """Replace a page's content and/or name. Pass the `revision` you read with project_read_page.

        If someone changed the page since, this is refused and you must read it again
        and merge their changes rather than overwrite them. Send the whole new content.
        """

        async def work(db: AsyncSession) -> str:
            page = await pages(db).update(
                ctx,
                project_id,
                UUID(page_id),
                PageUpdate(revision=revision, content=content, name=name),
            )
            return f"Saved {page.name} · now revision {page.revision}"

        return await run(work)

    return toolset
