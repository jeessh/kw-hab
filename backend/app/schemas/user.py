import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    first_name: str
    last_name: str
    username: str
    auth_type: str
    icons: list[str]
    accessibility_prefs: list[str]
    interest_categories: list[str]
    tts_enabled: bool
    voice_commands_enabled: bool
    eye_tracking_enabled: bool
    created_at: datetime


class UserUpdate(BaseModel):
    """Admin-editable fields on a user account."""

    first_name: str | None = None
    last_name: str | None = None


class UserPrefsUpdate(BaseModel):
    """Self-service preference update for PATCH /users/me. All fields optional;
    only those sent (exclude_unset) are applied to the authenticated member."""

    accessibility_prefs: list[str] | None = None
    interest_categories: list[str] | None = None
    tts_enabled: bool | None = None
    voice_commands_enabled: bool | None = None
    eye_tracking_enabled: bool | None = None
