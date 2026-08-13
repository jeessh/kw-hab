import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class RegistrationClick(Base):
    """One member following an event's outbound registration link.

    Append-only. When registration happens on the agency's own site, the click
    is the last thing this platform can observe — it stands in for "signed up",
    which is half of the adoption number nonprofits report to funders. So rows
    are never updated or deleted, and un-saving has no effect on them.
    """

    __tablename__ = "event_registration_clicks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id"), nullable=False
    )
    # Null for a signed-out visitor: the event page is public, and a click is
    # worth counting whether or not we know who made it.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    clicked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (Index("ix_registration_clicks_event", "event_id"),)
