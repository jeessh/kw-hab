import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

# A member who un-saves flips the status; the row stays. "How many people saved
# this" is then a cumulative number rather than a live count that walks
# backwards — which is what nonprofits need for grant reporting.
SAVED = "saved"
REMOVED = "removed"


class Attendance(Base):
    """Junction table: a user plans to attend an event (many-to-many)."""

    __tablename__ = "event_attendees"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        # RESTRICT, not CASCADE: attendance is what agencies report to funders,
        # so a stray DELETE against users must fail rather than quietly take
        # the history with it. Nothing in the API hard-deletes any more, but
        # the SQL editor is right there.
        ForeignKey("users.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        # RESTRICT for the same reason — see the user_id comment above.
        ForeignKey("events.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    status: Mapped[str] = mapped_column(
        Text, nullable=False, default=SAVED, server_default=text(f"'{SAVED}'")
    )

    # The PK is (user_id, event_id), so it can't serve "everyone who saved event
    # X" — the per-event counts the console needs would seq-scan without this.
    __table_args__ = (Index("ix_event_attendees_event", "event_id"),)

    user = relationship("User", back_populates="attending")
    event = relationship("Event", back_populates="attendees")
