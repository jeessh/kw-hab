import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


def _clean_name(value: str | None) -> str | None:
    """Trim, and reject a name that was only whitespace.

    min_length alone accepts "   " — three characters — which then strips down
    to an empty display name in the database with no error surfaced anywhere.
    """
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        raise ValueError("Name can't be blank")
    return trimmed


class HostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str
    is_admin: bool
    created_at: datetime


class HostWithCountsOut(HostOut):
    """HostOut plus how many programs the account owns.

    The admins list needs this to warn, before anyone confirms a removal, how
    many programs are about to change hands.
    """

    event_count: int = 0


class HostCreate(BaseModel):
    """A superadmin creating an account for an organizer.

    There is no self-serve host signup: accounts exist because a superadmin
    made one.
    """

    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=8)
    # Whether the new account can manage other admins. Off unless asked for.
    is_admin: bool = False

    _strip_name = field_validator("name")(_clean_name)


class HostUpdate(BaseModel):
    name: str | None = Field(None, min_length=1)
    is_admin: bool | None = None
    # Setting this resets the account's password; omitted leaves it alone.
    password: str | None = Field(None, min_length=8)

    _strip_name = field_validator("name")(_clean_name)
