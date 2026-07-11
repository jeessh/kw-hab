import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class EventImageIn(BaseModel):
    url: str
    caption: str | None = None
    sort_order: int = 0


class EventImageOut(EventImageIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


class EventBase(BaseModel):
    title: str
    description: str = ""
    category: str | None = None
    location: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    accessibility_tags: list[str] = []
    is_free: bool = True
    cover_image_url: str | None = None


class EventCreate(EventBase):
    gallery: list[EventImageIn] = []


class EventUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    location: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    accessibility_tags: list[str] | None = None
    is_free: bool | None = None
    cover_image_url: str | None = None


class EventOut(EventBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    host_id: uuid.UUID
    images: list[EventImageOut] = []
    created_at: datetime
