"""Intake decisions and saved views: what each transition does and refuses."""

import uuid
from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.exceptions import BadRequestError, NotFoundError
from app.core.permissions import AuthContext, OrgRoleName
from app.db.models.planning import IntakeRequest
from app.schemas.intake import IntakeAccept, IntakeDuplicate, IntakeSnooze, IntakeUpdate
from app.schemas.project_view import ViewFilters
from app.services import views_intake as module
from app.services.views_intake import IntakeService

pytestmark = pytest.mark.anyio

ORG, PROJECT = uuid.uuid4(), uuid.uuid4()


def _ctx() -> AuthContext:
    return AuthContext(user_id=uuid.uuid4(), organization_id=ORG, role=OrgRoleName.OWNER)


def _service() -> IntakeService:
    service = IntakeService(MagicMock(add=MagicMock(), flush=AsyncMock(), delete=AsyncMock()))
    service.projects = MagicMock(get=AsyncMock())
    service.items = MagicMock(create=AsyncMock())
    return service


def _request(status: str = "pending", **extra: object) -> IntakeRequest:
    return IntakeRequest(
        id=uuid.uuid4(),
        project_id=PROJECT,
        name="Event registration",
        description="A form",
        priority="high",
        status=status,
        **extra,
    )


def _found(request: IntakeRequest):
    return patch.object(module.repo, "get_request", AsyncMock(return_value=request))


async def test_accepting_creates_a_work_item_and_links_it() -> None:
    service = _service()
    item = MagicMock(id=uuid.uuid4())
    service.items.create.return_value = item
    request, ctx = _request(), _ctx()
    with _found(request):
        await service.accept(ctx, PROJECT, request.id, IntakeAccept(priority="urgent"))
    created = service.items.create.await_args.args[2]
    assert (created.name, created.priority) == ("Event registration", "urgent")
    assert request.status == "accepted"
    assert request.work_item_id == item.id
    assert request.decided_by_user_id == ctx.user_id
    assert request.decided_at is not None


async def test_the_request_priority_is_kept_unless_the_decider_changes_it() -> None:
    service = _service()
    service.items.create.return_value = MagicMock(id=uuid.uuid4())
    request = _request()
    with _found(request):
        await service.accept(_ctx(), PROJECT, request.id, IntakeAccept())
    assert service.items.create.await_args.args[2].priority == "high"


@pytest.mark.parametrize("action", ["decline", "snooze", "duplicate", "update", "accept"])
async def test_an_accepted_request_is_final(action: str) -> None:
    service = _service()
    request = _request("accepted")
    calls = {
        "decline": lambda: service.decline(_ctx(), PROJECT, request.id),
        "snooze": lambda: service.snooze(
            _ctx(), PROJECT, request.id, IntakeSnooze(until=datetime.now(UTC).date() + timedelta(3))
        ),
        "duplicate": lambda: service.duplicate(
            _ctx(), PROJECT, request.id, IntakeDuplicate(work_item_id=uuid.uuid4())
        ),
        "update": lambda: service.update(_ctx(), PROJECT, request.id, IntakeUpdate(name="x")),
        "accept": lambda: service.accept(_ctx(), PROJECT, request.id, IntakeAccept()),
    }
    with _found(request), pytest.raises(BadRequestError):
        await calls[action]()
    service.items.create.assert_not_awaited()


async def test_snoozing_needs_a_future_date_and_declining_clears_it() -> None:
    service = _service()
    request = _request()
    with _found(request):
        with pytest.raises(BadRequestError):
            await service.snooze(
                _ctx(), PROJECT, request.id, IntakeSnooze(until=datetime.now(UTC).date())
            )
        until = datetime.now(UTC).date() + timedelta(days=5)
        await service.snooze(_ctx(), PROJECT, request.id, IntakeSnooze(until=until))
        assert (request.status, request.snoozed_until) == ("snoozed", until)
        await service.decline(_ctx(), PROJECT, request.id)
    assert (request.status, request.snoozed_until) == ("declined", None)


async def test_a_duplicate_points_at_a_work_item_of_the_project() -> None:
    service = _service()
    request, item_id = _request(), uuid.uuid4()
    with _found(request):
        with (
            patch.object(module.work_item_repo, "get", AsyncMock(return_value=None)),
            pytest.raises(NotFoundError),
        ):
            await service.duplicate(
                _ctx(), PROJECT, request.id, IntakeDuplicate(work_item_id=item_id)
            )
        with patch.object(module.work_item_repo, "get", AsyncMock(return_value=MagicMock())):
            await service.duplicate(
                _ctx(), PROJECT, request.id, IntakeDuplicate(work_item_id=item_id)
            )
    assert (request.status, request.work_item_id) == ("duplicate", item_id)


async def test_a_missing_request_is_not_found() -> None:
    service = _service()
    with (
        patch.object(module.repo, "get_request", AsyncMock(return_value=None)),
        pytest.raises(NotFoundError),
    ):
        await service.get(_ctx(), PROJECT, uuid.uuid4())


def test_view_filters_round_trip_through_json() -> None:
    filters = ViewFilters(priority="urgent", label="bug", due_before=date(2030, 1, 1))
    stored = filters.model_dump(mode="json", exclude_none=True)
    assert stored == {"priority": "urgent", "label": "bug", "due_before": "2030-01-01"}
    assert ViewFilters.model_validate(stored) == filters
