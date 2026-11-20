"""The planning tools an agent has in a project: what they call, and what they refuse."""

import uuid
from contextlib import asynccontextmanager
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.agents import project_planning as module
from app.agents.project_planning import project_planning_toolset
from app.core.exceptions import ConflictError, NotFoundError
from app.core.permissions import AuthContext, OrgRoleName
from app.db.models.work_item import WorkItem

pytestmark = pytest.mark.anyio

ORG, PROJECT = uuid.uuid4(), uuid.uuid4()
CTX = AuthContext(user_id=uuid.uuid4(), organization_id=ORG, role=OrgRoleName.OWNER)


@asynccontextmanager
async def _session():
    yield MagicMock()


def _tools():
    return project_planning_toolset(PROJECT, CTX, session=_session).tools


def _item(number: int = 12, **extra: object) -> WorkItem:
    fields: dict[str, object] = {
        "id": uuid.uuid4(),
        "project_id": PROJECT,
        "sequence_id": number,
        "name": "Write brief",
        "description": "Cover the launch",
        "state": "todo",
        "priority": "high",
        "labels": [],
        "cycle_id": None,
        "start_date": None,
        "target_date": None,
    }
    return WorkItem(**{**fields, **extra})


async def call(tool: str, /, **kwargs: object) -> str:
    return await _tools()[tool].function(**kwargs)


def test_the_agent_gets_planning_tools_but_cannot_decide_intake() -> None:
    names = set(_tools())
    assert {
        "project_list_work_items",
        "project_create_work_item",
        "project_update_work_item",
        "project_read_page",
        "project_edit_page",
        "project_file_intake_request",
    } <= names
    assert not {n for n in names if "accept" in n or "decline" in n or "delete" in n}


async def test_listing_work_items_is_compact_and_filtered() -> None:
    service = MagicMock(list=AsyncMock(return_value=([_item(3), _item(4, state="done")], 9)))
    with patch.object(module, "WorkItemService", return_value=service):
        text = await call("project_list_work_items", state="todo", query="brief")
    assert text.startswith("2 of 9 work items:")
    assert "#3 [todo | high] Write brief" in text
    assert service.list.await_args.kwargs["state"] == "todo"
    assert service.list.await_args.kwargs["search"] == "brief"


async def test_creating_a_work_item_acts_as_the_run_user_and_returns_its_number() -> None:
    service = MagicMock(create=AsyncMock(return_value=_item(7, name="Ship")))
    with patch.object(module, "WorkItemService", return_value=service):
        text = await call("project_create_work_item", name="Ship", due_date="2026-12-01")
    assert text == "Created #7: Ship"
    ctx, project, data = service.create.await_args.args
    assert (ctx, project) == (CTX, PROJECT)
    assert data.target_date == date(2026, 12, 1)


async def test_updating_by_number_changes_only_what_was_passed() -> None:
    item = _item(12)
    service = MagicMock(update=AsyncMock(return_value=_item(12, state="done")))
    with (
        patch.object(module, "WorkItemService", return_value=service),
        patch.object(module.work_item_repo, "get_by_sequence", AsyncMock(return_value=item)),
    ):
        text = await call("project_update_work_item", number=12, state="done")
    assert text.startswith("Updated #12 [done")
    update = service.update.await_args.args[3]
    assert update.model_dump(exclude_unset=True) == {"state": "done"}


async def test_an_unknown_number_is_an_answer_not_a_crash() -> None:
    with (
        patch.object(module, "WorkItemService", return_value=MagicMock()),
        patch.object(module.work_item_repo, "get_by_sequence", AsyncMock(return_value=None)),
    ):
        text = await call("project_get_work_item", number=99)
    assert text == "Not done: There is no work item #99 in this project"


async def test_a_page_edit_conflict_tells_the_agent_to_read_again() -> None:
    service = MagicMock(
        update=AsyncMock(
            side_effect=ConflictError(
                message="Someone else changed this page. Reload it to see their changes."
            )
        )
    )
    with patch.object(module, "PageService", return_value=service):
        text = await call(
            "project_edit_page", page_id=str(uuid.uuid4()), revision=2, content="# mine"
        )
    assert text.startswith("Not done: Someone else changed this page")


async def test_a_missing_page_is_an_answer_not_a_crash() -> None:
    service = MagicMock(
        get=AsyncMock(side_effect=NotFoundError(message="Page not found", details={}))
    )
    with patch.object(module, "PageService", return_value=service):
        text = await call("project_read_page", page_id=str(uuid.uuid4()))
    assert text == "Not done: Page not found"


async def test_an_agent_files_a_request_for_people_to_decide() -> None:
    request = MagicMock()
    request.name = "Dark mode"
    service = MagicMock(create=AsyncMock(return_value=request))
    with patch.object(module, "IntakeService", return_value=service):
        text = await call("project_file_intake_request", name="Dark mode", priority="low")
    assert text == "Filed request: Dark mode (pending review)"


async def test_the_gate_serves_only_the_runs_own_project() -> None:
    gate = module._RunsProject(PROJECT)
    assert await gate.get(CTX, PROJECT) is None
    with pytest.raises(module.AppException):
        await gate.get(CTX, uuid.uuid4())
