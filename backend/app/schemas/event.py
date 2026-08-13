import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.event import EXTERNAL, INTERNAL

_MODES = {INTERNAL, EXTERNAL}


def validate_registration(
    mode: str, requires_signup: bool, url: str | None
) -> None:
    """The rules tying the two registration fields together.

    Shared by create (whole payload) and update (the merged result of a partial
    patch), so a PATCH can't leave a row in a state a POST would have rejected.
    """
    if mode not in _MODES:
        raise ValueError(f"registration_mode must be one of {sorted(_MODES)}")
    # The link is only load-bearing in one of the four states — the one where a
    # member is sent somewhere. Requiring it otherwise would just be a field to
    # fill in for staff who already have no time.
    if mode == EXTERNAL and requires_signup and not (url or "").strip():
        raise ValueError(
            "A registration link is required when sign-up happens on your own site."
        )
    if url and not url.startswith(("http://", "https://")):
        raise ValueError("The registration link must start with http:// or https://")


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
    requires_signup: bool = False
    registration_mode: str = INTERNAL
    registration_url: str | None = None
    cover_image_url: str | None = None


class EventCreate(EventBase):
    gallery: list[EventImageIn] = []

    @model_validator(mode="after")
    def _check_registration(self):
        validate_registration(
            self.registration_mode, self.requires_signup, self.registration_url
        )
        return self


class EventUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    location: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    accessibility_tags: list[str] | None = None
    is_free: bool | None = None
    requires_signup: bool | None = None
    registration_mode: str | None = None
    registration_url: str | None = None
    cover_image_url: str | None = None


class EventOut(EventBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    host_id: uuid.UUID
    host_name: str = ""
    images: list[EventImageOut] = []
    created_at: datetime
