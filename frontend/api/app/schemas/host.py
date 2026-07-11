import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class HostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str
    is_admin: bool
    created_at: datetime
