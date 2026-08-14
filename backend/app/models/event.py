import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

# Where registering for a program actually happens.
INTERNAL = "internal"
EXTERNAL = "external"


class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    host_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hosts.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    # What kind of thing it is, as distinct from what it is about: category is
    # the topic (Cooking), activity_type is the shape (a class, a drop-in
    # social, an outing). Picked from lib/activities.ts, same as category —
    # a hand-typed value can never match a member's choice.
    activity_type: Mapped[str | None] = mapped_column(Text, nullable=True)
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
    # True = the member must register; False = drop-in, just save it. Where that
    # registration happens is registration_mode's job.
    requires_signup: Mapped[bool] = mapped_column(Boolean, default=False)
    # "internal" — registering creates an Attendance row here; no extra form,
    # the member's account already has what the host needs.
    # "external" — registration lives in the agency's own system, so a member
    # who must register leaves for registration_url and we count the click.
    # Only meaningful when requires_signup is true; a drop-in program saves the
    # same way either way.
    registration_mode: Mapped[str] = mapped_column(
        Text, nullable=False, default=INTERNAL, server_default=text(f"'{INTERNAL}'")
    )
    registration_url: Mapped[str | None] = mapped_column(Text, nullable=True)
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

    # Declared explicitly rather than via index=True so the names match what the
    # live database actually has (`ix_events_host`, not SQLAlchemy's default
    # `ix_events_host_id`). Autogenerate diffs metadata against the DB, so a
    # mismatch here makes every future revision propose spurious index churn.
    __table_args__ = (
        Index("ix_events_host", "host_id"),
        Index(
            "ix_events_live",
            "starts_at",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    host = relationship("Host", back_populates="events")

    @property
    def host_name(self) -> str:
        """Owning organization's display name, surfaced on EventOut for dashboards."""
        return self.host.name if self.host else ""

    @property
    def host_logo_url(self) -> str | None:
        """Owning organization's logo, for the member feed's org stepper."""
        return self.host.logo_url if self.host else None

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
