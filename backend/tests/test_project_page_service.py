"""Pages: the revision rule, locking, archiving and what a version records."""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.exceptions import AuthorizationError, BadRequestError, ConflictError
from app.core.permissions import AuthContext, OrgRoleName
from app.db.models.planning import ProjectPage, ProjectPageVersion
from app.schemas.project_page import PageUpdate
from app.services import project_page as module
from app.services.project_page import PageService

pytestmark = pytest.mark.anyio

ORG, PROJECT = uuid.uuid4(), uuid.uuid4()


def _ctx(user: uuid.UUID | None = None) -> AuthContext:
    return AuthContext(user_id=user or uuid.uuid4(), organization_id=ORG, role=OrgRoleName.OWNER)


def _service() -> tuple[PageService, MagicMock]:
    db = MagicMock(add=MagicMock(), flush=AsyncMock(), delete=AsyncMock())
    service = PageService(db)
    service.projects = MagicMock(get=AsyncMock())
    return service, db


def _page(**extra: object) -> ProjectPage:
    fields: dict[str, object] = {
        "id": uuid.uuid4(),
        "project_id": PROJECT,
        "name": "Spec",
        "content": "# v1",
        "revision": 3,
        "is_locked": False,
        "archived_at": None,
        "owned_by_user_id": None,
    }
    return ProjectPage(**{**fields, **extra})


def _found(page: ProjectPage):
    return patch.object(module.repo, "get", AsyncMock(return_value=page))


@pytest.fixture(autouse=True)
def _no_prune():
    with patch.object(module.repo, "prune_versions", AsyncMock()):
        yield


def _versions(db: MagicMock) -> list[ProjectPageVersion]:
    return [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], ProjectPageVersion)]


async def test_an_edit_bumps_the_revision_and_records_the_version() -> None:
    service, db = _service()
    page, ctx = _page(), _ctx()
    with _found(page):
        await service.update(ctx, PROJECT, page.id, PageUpdate(revision=3, content="# v2"))
    assert (page.revision, page.content, page.last_edited_by_user_id) == (4, "# v2", ctx.user_id)
    (version,) = _versions(db)
    assert (version.revision, version.content) == (4, "# v2")


async def test_an_edit_against_a_stale_revision_is_a_conflict() -> None:
    service, db = _service()
    page = _page()
    with _found(page), pytest.raises(ConflictError) as raised:
        await service.update(_ctx(), PROJECT, page.id, PageUpdate(revision=2, content="# mine"))
    assert raised.value.details == {"current_revision": 3}
    assert (page.content, page.revision) == ("# v1", 3)
    assert _versions(db) == []


async def test_an_edit_that_changes_nothing_does_not_add_a_revision() -> None:
    service, db = _service()
    page = _page()
    with _found(page):
        await service.update(_ctx(), PROJECT, page.id, PageUpdate(revision=3, content="# v1"))
    assert page.revision == 3
    assert _versions(db) == []


async def test_an_explicit_null_never_blanks_the_name() -> None:
    service, _ = _service()
    page = _page()
    with _found(page):
        await service.update(
            _ctx(),
            PROJECT,
            page.id,
            PageUpdate.model_validate({"revision": 3, "name": None, "content": "x"}),
        )
    assert page.name == "Spec"


@pytest.mark.parametrize("state", [{"is_locked": True}, {"archived_at": datetime.now(UTC)}])
async def test_a_locked_or_archived_page_refuses_edits_and_restores(
    state: dict[str, object],
) -> None:
    service, _ = _service()
    page = _page(**state)
    with _found(page):
        with pytest.raises(BadRequestError):
            await service.update(_ctx(), PROJECT, page.id, PageUpdate(revision=3, content="x"))
        with pytest.raises(BadRequestError):
            await service.restore(_ctx(), PROJECT, page.id, uuid.uuid4())


async def test_only_the_owner_locks_a_page() -> None:
    service, _ = _service()
    owner = uuid.uuid4()
    page = _page(owned_by_user_id=owner)
    with _found(page):
        with pytest.raises(AuthorizationError):
            await service.set_lock(_ctx(), PROJECT, page.id, locked=True)
        await service.set_lock(_ctx(owner), PROJECT, page.id, locked=True)
    assert page.is_locked is True


async def test_a_page_is_archived_before_it_can_be_deleted() -> None:
    service, db = _service()
    page = _page()
    with _found(page):
        with pytest.raises(BadRequestError):
            await service.delete(_ctx(), PROJECT, page.id)
        await service.set_archived(_ctx(), PROJECT, page.id, archived=True)
        assert page.archived_at is not None
        await service.delete(_ctx(), PROJECT, page.id)
    db.delete.assert_awaited_once_with(page)


async def test_restoring_a_version_makes_a_new_revision_with_the_old_content() -> None:
    service, db = _service()
    page = _page(content="# now", revision=5)
    old = ProjectPageVersion(page_id=page.id, revision=2, name="Old spec", content="# then")
    with (
        _found(page),
        patch.object(module.repo, "get_version", AsyncMock(return_value=old)),
    ):
        await service.restore(_ctx(), PROJECT, page.id, uuid.uuid4())
    assert (page.name, page.content, page.revision) == ("Old spec", "# then", 6)
    assert _versions(db)[0].revision == 6
