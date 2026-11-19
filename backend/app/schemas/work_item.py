"""Work items: the tasks a project tracks (adapted from Plane's issue model)."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.base import BaseSchema

State = Literal["backlog", "todo", "in_progress", "done", "cancelled"]
Priority = Literal["none", "urgent", "high", "medium", "low"]


class _Dated(BaseSchema):
    @model_validator(mode="after")
    def _ordered(self):
        start = getattr(self, "start_date", None)
        target = getattr(self, "target_date", None)
        if start and target and start > target:
            raise ValueError("target_date precedes start_date")
        return self


class WorkItemCreate(_Dated):
    name: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=100_000)
    state: State = "backlog"
    priority: Priority = "none"
    assignee_user_id: UUID | None = None
    start_date: date | None = None
    target_date: date | None = None
    labels: list[str] = Field(default_factory=list, max_length=50)


class WorkItemUpdate(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=100_000)
    state: State | None = None
    priority: Priority | None = None
    assignee_user_id: UUID | None = None
    start_date: date | None = None
    target_date: date | None = None
    labels: list[str] | None = Field(default=None, max_length=50)


class WorkItemRead(BaseSchema):
    id: UUID
    project_id: UUID
    sequence_id: int
    name: str
    description: str
    state: State
    priority: Priority
    assignee_user_id: UUID | None
    created_by_user_id: UUID | None
    start_date: date | None
    target_date: date | None
    labels: list[str]
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime | None


class WorkItemList(BaseSchema):
    items: list[WorkItemRead]
    total: int


class CommentCreate(BaseSchema):
    body: str = Field(min_length=1, max_length=20_000)


class CommentRead(BaseSchema):
    id: UUID
    work_item_id: UUID
    author_user_id: UUID | None
    body: str
    created_at: datetime


class ActivityRead(BaseSchema):
    id: UUID
    actor_user_id: UUID | None
    field: str
    old_value: str | None
    new_value: str | None
    created_at: datetime
