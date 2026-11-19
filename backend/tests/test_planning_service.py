"""Cycles and modules: where a cycle is in time, and the rules a change must keep."""

import uuid
from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.exceptions import BadRequestError, NotFoundError
from app.core.permissions import AuthContext, OrgRoleName
from app.db.models.planning import Cycle
from app.schemas.planning import CycleCreate, CycleUpdate, ModuleCreate
from app.services import planning as module
from app.services.planning import PlanningService, cycle_status

pytestmark = pytest.mark.anyio

ORG, PROJECT = uuid.uuid4(), uuid.uuid4()
TODAY = date(2026, 11, 20)


def _ctx() -> AuthContext:
    return AuthContext(user_id=uuid.uuid4(), organization_id=ORG, role=OrgRoleName.OWNER)


def _service() -> PlanningService:
    service = PlanningService(MagicMock(add=MagicMock(), flush=AsyncMock(), delete=AsyncMock()))
    service.projects = MagicMock(get=AsyncMock())
    return service


@pytest.mark.parametrize(
    ("start", "end", "expected"),
    [
        (date(2026, 11, 18), date(2026, 11, 25), "current"),
        (TODAY, TODAY, "current"),
        (date(2026, 11, 21), date(2026, 11, 30), "upcoming"),
        (date(2026, 11, 1), date(2026, 11, 19), "completed"),
        (None, None, "draft"),
        (None, date(2026, 12, 1), "draft"),
    ],
)
def test_cycle_status(start: date | None, end: date | None, expected: str) -> None:
    assert cycle_status(start, end, TODAY) == expected


def test_reversed_dates_are_refused_on_create() -> None:
    with pytest.raises(ValueError, match="precedes"):
        CycleCreate(name="Sprint", start_date=date(2026, 12, 2), end_date=date(2026, 12, 1))
    with pytest.raises(ValueError, match="precedes"):
        ModuleCreate(name="Auth", start_date=date(2026, 12, 2), target_date=date(2026, 12, 1))


async def test_updating_a_cycle_keeps_its_dates_ordered() -> None:
    service = _service()
    cycle = Cycle(
        id=uuid.uuid4(),
        project_id=PROJECT,
        name="S",
        description="",
        start_date=date(2026, 12, 10),
        end_date=date(2026, 12, 20),
        created_at=datetime.now(UTC),
    )
    with (
        patch.object(module.repo, "get_cycle", AsyncMock(return_value=cycle)),
        patch.object(module.repo, "cycle_counts", AsyncMock(return_value={})),
        pytest.raises(BadRequestError),
    ):
        await service.update_cycle(
            _ctx(), PROJECT, cycle.id, CycleUpdate(end_date=date(2026, 12, 1))
        )


async def test_a_missing_cycle_is_not_found() -> None:
    service = _service()
    with (
        patch.object(module.repo, "get_cycle", AsyncMock(return_value=None)),
        pytest.raises(NotFoundError),
    ):
        await service.delete_cycle(_ctx(), PROJECT, uuid.uuid4())


async def test_only_an_existing_item_can_join_a_module() -> None:
    service = _service()
    with (
        patch.object(module.repo, "get_module", AsyncMock(return_value=MagicMock())),
        patch.object(module.work_item_repo, "get", AsyncMock(return_value=None)),
        pytest.raises(NotFoundError),
    ):
        await service.add_to_module(_ctx(), PROJECT, uuid.uuid4(), uuid.uuid4())
