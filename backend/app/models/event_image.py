import uuid

from sqlalchemy import ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class EventImage(Base):
    """A gallery image for an event (cover image lives on Event.cover_image_url)."""

    __tablename__ = "event_images"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE")
    )
    url: Mapped[str] = mapped_column(String)
    caption: Mapped[str | None] = mapped_column(String, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # Explicit name to match the live database — see Event.__table_args__.
    __table_args__ = (Index("ix_event_images_event", "event_id"),)

    event = relationship("Event", back_populates="images")
