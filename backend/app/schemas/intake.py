"""Intake: requests awaiting a decision (adapted from Plane's intake)."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseSchema
from app.schemas.work_item import Priority

IntakeStatus = Literal["pending", "accepted", "declined", "snoozed", "duplicate"]


class IntakeCreate(BaseSchema):
    name: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=100_000)
    priority: Priority = "none"


class IntakeUpdate(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=100_000)
    priority: Priority | None = None


class IntakeRead(BaseSchema):
    id: UUID
    project_id: UUID
    name: str
    description: str
    priority: Priority
    status: IntakeStatus
    requested_by_user_id: UUID | None
    decided_by_user_id: UUID | None
    decided_at: datetime | None
    snoozed_until: date | None
    work_item_id: UUID | None
    created_at: datetime


class IntakeList(BaseSchema):
    items: list[IntakeRead]
    total: int


class IntakeAccept(BaseSchema):
    """What the work item made from a request starts with, beyond the request itself."""

    priority: Priority | None = None
    assignee_user_id: UUID | None = None
    cycle_id: UUID | None = None


class IntakeSnooze(BaseSchema):
    until: date


class IntakeDuplicate(BaseSchema):
    work_item_id: UUID
