import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    host_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hosts.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ends_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    accessibility_tags: Mapped[list[str]] = mapped_column(
        ARRAY(Text), default=list  # text[] to match the DB; see user.icons note
    )
    is_free: Mapped[bool] = mapped_column(Boolean, default=True)
    # True = member must sign up (creates an Attendance row); False = drop-in,
    # no registration. Signup carries no extra form — the member's account
    # (name, username, icons) already has everything the host needs.
    requires_signup: Mapped[bool] = mapped_column(Boolean, default=False)
    cover_image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    # Archived, not destroyed. Every read path filters on this; nothing deletes
    # the row, because the attendance attached to it is what nonprofits report
    # in grant applications.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    host = relationship("Host", back_populates="events")

    @property
    def host_name(self) -> str:
        """Owning organization's display name, surfaced on EventOut for dashboards."""
        return self.host.name if self.host else ""

    images = relationship(
        "EventImage",
        back_populates="event",
        cascade="all, delete-orphan",
        order_by="EventImage.sort_order",
    )
    # No delete-orphan here on purpose. Events are archived, never deleted, so
    # this cascade would only ever fire from a future `db.delete(event)` — and
    # then it would silently take the attendance history with it. Without it,
    # such a call fails loudly on the NOT NULL event_id instead.
    attendees = relationship("Attendance", back_populates="event")
