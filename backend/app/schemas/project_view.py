"""Saved views: named work item filters (adapted from Plane's views)."""

from datetime import date, datetime
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseSchema
from app.schemas.work_item import Priority, State


class ViewFilters(BaseSchema):
    """The work item filters a view applies. An absent filter matches everything."""

    state: State | None = None
    priority: Priority | None = None
    assignee_user_id: UUID | None = None
    label: str | None = Field(default=None, max_length=100)
    cycle_id: UUID | None = None
    module_id: UUID | None = None
    due_before: date | None = None
    q: str | None = Field(default=None, max_length=100)


class ProjectViewCreate(BaseSchema):
    name: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=20_000)
    filters: ViewFilters = Field(default_factory=ViewFilters)


class ProjectViewUpdate(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=20_000)
    filters: ViewFilters | None = None


class ProjectViewRead(BaseSchema):
    id: UUID
    project_id: UUID
    name: str
    description: str
    filters: ViewFilters
    created_at: datetime


class ProjectViewList(BaseSchema):
    items: list[ProjectViewRead]
