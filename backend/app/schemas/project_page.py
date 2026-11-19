"""Pages: documents a project's team writes together (adapted from Plane's pages)."""

from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseSchema

MAX_CONTENT = 500_000
"""Half a megabyte of Markdown: a long document, not a place to store files."""


class PageCreate(BaseSchema):
    name: str = Field(min_length=1, max_length=255)
    content: str = Field(default="", max_length=MAX_CONTENT)


class PageUpdate(BaseSchema):
    """A change to a page's name or content, made against the revision the editor read."""

    revision: int = Field(ge=1, description="The revision this edit was made against")
    name: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = Field(default=None, max_length=MAX_CONTENT)


class PageSummary(BaseSchema):
    id: UUID
    project_id: UUID
    name: str
    revision: int
    is_locked: bool
    archived_at: datetime | None
    owned_by_user_id: UUID | None
    last_edited_by_user_id: UUID | None
    created_at: datetime
    updated_at: datetime | None


class PageRead(PageSummary):
    content: str


class PageList(BaseSchema):
    items: list[PageSummary]
    total: int


class PageVersionSummary(BaseSchema):
    id: UUID
    revision: int
    name: str
    edited_by_user_id: UUID | None
    created_at: datetime


class PageVersionRead(PageVersionSummary):
    content: str
