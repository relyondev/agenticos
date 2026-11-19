"""Work items: numbering, the activity trail and the rules a change must keep."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.exceptions import BadRequestError, NotFoundError
from app.core.permissions import AuthContext, OrgRoleName, Perm
from app.db.models.work_item import WorkItem, WorkItemActivity
from app.schemas.work_item import WorkItemCreate, WorkItemUpdate
from app.services import work_item as module
from app.services.work_item import WorkItemService

pytestmark = pytest.mark.anyio

ORG, PROJECT = uuid.uuid4(), uuid.uuid4()


def _ctx() -> AuthContext:
    return AuthContext(user_id=uuid.uuid4(), organization_id=ORG, role=OrgRoleName.OWNER)


def _service() -> tuple[WorkItemService, MagicMock]:
    db = MagicMock(add=MagicMock(), flush=AsyncMock(), delete=AsyncMock())
    service = WorkItemService(db)
    service.projects = MagicMock(get=AsyncMock())
    return service, db


def _added(db: MagicMock, kind: type) -> list:
    return [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], kind)]


async def test_create_numbers_the_item_and_records_it() -> None:
    service, db = _service()
    ctx = _ctx()
    with patch.object(module.repo, "next_sequence", AsyncMock(return_value=7)):
        item = await service.create(ctx, PROJECT, WorkItemCreate(name="Write brief"))
    assert item.sequence_id == 7
    assert item.created_by_user_id == ctx.user_id
    assert item.completed_at is None
    service.projects.get.assert_awaited_once_with(ctx, PROJECT, perm=Perm.PROJECTS_USE)
    assert [a.field for a in _added(db, WorkItemActivity)] == ["created"]


async def test_creating_an_item_already_done_stamps_completion() -> None:
    service, _ = _service()
    with patch.object(module.repo, "next_sequence", AsyncMock(return_value=1)):
        item = await service.create(_ctx(), PROJECT, WorkItemCreate(name="x", state="done"))
    assert item.completed_at is not None


async def test_update_records_only_what_changed() -> None:
    service, db = _service()
    item = WorkItem(project_id=PROJECT, name="A", state="backlog", priority="none", labels=[])
    with patch.object(module.repo, "get", AsyncMock(return_value=item)):
        await service.update(
            _ctx(),
            PROJECT,
            uuid.uuid4(),
            WorkItemUpdate(name="A", state="in_progress", priority="high"),
        )
    trail = {a.field: (a.old_value, a.new_value) for a in _added(db, WorkItemActivity)}
    assert trail == {"state": ("backlog", "in_progress"), "priority": ("none", "high")}
    assert item.completed_at is None


async def test_moving_to_done_stamps_completion_and_back_clears_it() -> None:
    service, _ = _service()
    item = WorkItem(project_id=PROJECT, name="A", state="todo", priority="none", labels=[])
    with patch.object(module.repo, "get", AsyncMock(return_value=item)):
        await service.update(_ctx(), PROJECT, uuid.uuid4(), WorkItemUpdate(state="done"))
        assert item.completed_at is not None
        await service.update(_ctx(), PROJECT, uuid.uuid4(), WorkItemUpdate(state="todo"))
        assert item.completed_at is None


async def test_dates_must_stay_ordered_on_update() -> None:
    from datetime import date

    service, _ = _service()
    item = WorkItem(
        project_id=PROJECT,
        name="A",
        state="todo",
        priority="none",
        labels=[],
        start_date=date(2026, 12, 10),
    )
    with (
        patch.object(module.repo, "get", AsyncMock(return_value=item)),
        pytest.raises(BadRequestError),
    ):
        await service.update(
            _ctx(), PROJECT, uuid.uuid4(), WorkItemUpdate(target_date=date(2026, 12, 1))
        )


async def test_a_missing_item_is_not_found() -> None:
    service, _ = _service()
    with (
        patch.object(module.repo, "get", AsyncMock(return_value=None)),
        pytest.raises(NotFoundError),
    ):
        await service.get(_ctx(), PROJECT, uuid.uuid4())


def test_create_rejects_reversed_dates() -> None:
    from datetime import date

    with pytest.raises(ValueError, match="precedes"):
        WorkItemCreate(name="x", start_date=date(2026, 12, 10), target_date=date(2026, 12, 1))
