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
    created_at: datetime


class UserUpdate(BaseModel):
    """Admin-editable fields on a user account."""

    first_name: str | None = None
    last_name: str | None = None
