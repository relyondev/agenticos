"""Cycles and modules: how a project's work items are grouped (adapted from Plane)."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.base import BaseSchema

ModuleStatus = Literal["backlog", "planned", "in_progress", "paused", "completed", "cancelled"]
CycleStatus = Literal["draft", "upcoming", "current", "completed"]


def _ordered(start: date | None, end: date | None) -> None:
    if start and end and start > end:
        raise ValueError("the end date precedes the start date")


class CycleCreate(BaseSchema):
    name: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=20_000)
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def _dates(self) -> CycleCreate:
        _ordered(self.start_date, self.end_date)
        return self


class CycleUpdate(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=20_000)
    start_date: date | None = None
    end_date: date | None = None


class CycleRead(BaseSchema):
    id: UUID
    project_id: UUID
    name: str
    description: str
    start_date: date | None
    end_date: date | None
    status: CycleStatus
    total_items: int = 0
    done_items: int = 0
    created_at: datetime


class CycleList(BaseSchema):
    items: list[CycleRead]


class ModuleCreate(BaseSchema):
    name: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=20_000)
    status: ModuleStatus = "backlog"
    start_date: date | None = None
    target_date: date | None = None
    lead_user_id: UUID | None = None

    @model_validator(mode="after")
    def _dates(self) -> ModuleCreate:
        _ordered(self.start_date, self.target_date)
        return self


class ModuleUpdate(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=20_000)
    status: ModuleStatus | None = None
    start_date: date | None = None
    target_date: date | None = None
    lead_user_id: UUID | None = None


class ModuleRead(BaseSchema):
    id: UUID
    project_id: UUID
    name: str
    description: str
    status: ModuleStatus
    start_date: date | None
    target_date: date | None
    lead_user_id: UUID | None
    total_items: int = 0
    done_items: int = 0
    created_at: datetime


class ModuleList(BaseSchema):
    items: list[ModuleRead]
