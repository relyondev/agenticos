"""Pages and their versions: data access."""

from uuid import UUID

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.planning import ProjectPage, ProjectPageVersion

KEEP_VERSIONS = 50
"""How many revisions of a page are kept; the oldest go first."""


async def get(
    db: AsyncSession, project_id: UUID, page_id: UUID, *, for_update: bool = False
) -> ProjectPage | None:
    statement = select(ProjectPage).where(
        ProjectPage.project_id == project_id, ProjectPage.id == page_id
    )
    if for_update:
        statement = statement.execution_options(populate_existing=True).with_for_update()
    return (await db.execute(statement)).scalar_one_or_none()


async def list_pages(
    db: AsyncSession,
    project_id: UUID,
    *,
    archived: bool = False,
    search: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[ProjectPage], int]:
    conditions = [
        ProjectPage.project_id == project_id,
        ProjectPage.archived_at.is_not(None) if archived else ProjectPage.archived_at.is_(None),
    ]
    if search:
        like = f"%{search.replace('%', r'\%').replace('_', r'\_')}%"
        conditions.append(or_(ProjectPage.name.ilike(like), ProjectPage.content.ilike(like)))
    total = (
        await db.execute(select(func.count()).select_from(ProjectPage).where(*conditions))
    ).scalar_one()
    rows = await db.execute(
        select(ProjectPage)
        .where(*conditions)
        .order_by(ProjectPage.updated_at.desc().nulls_last(), ProjectPage.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(rows.scalars().all()), int(total)


async def versions(db: AsyncSession, page_id: UUID) -> list[ProjectPageVersion]:
    rows = await db.execute(
        select(ProjectPageVersion)
        .where(ProjectPageVersion.page_id == page_id)
        .order_by(ProjectPageVersion.revision.desc())
    )
    return list(rows.scalars().all())


async def get_version(
    db: AsyncSession, page_id: UUID, version_id: UUID
) -> ProjectPageVersion | None:
    result = await db.execute(
        select(ProjectPageVersion).where(
            ProjectPageVersion.page_id == page_id, ProjectPageVersion.id == version_id
        )
    )
    return result.scalar_one_or_none()


async def prune_versions(db: AsyncSession, page_id: UUID) -> None:
    keep = (
        select(ProjectPageVersion.id)
        .where(ProjectPageVersion.page_id == page_id)
        .order_by(ProjectPageVersion.revision.desc())
        .limit(KEEP_VERSIONS)
    )
    await db.execute(
        delete(ProjectPageVersion).where(
            ProjectPageVersion.page_id == page_id, ProjectPageVersion.id.not_in(keep)
        )
    )
