"""Saved views and intake requests: data access."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.planning import IntakeRequest, ProjectView


async def get_view(db: AsyncSession, project_id: UUID, view_id: UUID) -> ProjectView | None:
    result = await db.execute(
        select(ProjectView).where(ProjectView.project_id == project_id, ProjectView.id == view_id)
    )
    return result.scalar_one_or_none()


async def list_views(db: AsyncSession, project_id: UUID) -> list[ProjectView]:
    result = await db.execute(
        select(ProjectView).where(ProjectView.project_id == project_id).order_by(ProjectView.name)
    )
    return list(result.scalars().all())


async def get_request(db: AsyncSession, project_id: UUID, request_id: UUID) -> IntakeRequest | None:
    result = await db.execute(
        select(IntakeRequest).where(
            IntakeRequest.project_id == project_id, IntakeRequest.id == request_id
        )
    )
    return result.scalar_one_or_none()


async def list_requests(
    db: AsyncSession,
    project_id: UUID,
    *,
    status: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[IntakeRequest], int]:
    conditions = [IntakeRequest.project_id == project_id]
    if status:
        conditions.append(IntakeRequest.status == status)
    total = (
        await db.execute(select(func.count()).select_from(IntakeRequest).where(*conditions))
    ).scalar_one()
    rows = await db.execute(
        select(IntakeRequest)
        .where(*conditions)
        .order_by(IntakeRequest.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(rows.scalars().all()), int(total)
