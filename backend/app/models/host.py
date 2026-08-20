import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Host(Base):
    """An organizer / nonprofit staff account. Admins are hosts with is_admin=True."""

    __tablename__ = "hosts"
    __table_args__ = (
        Index(
            "uq_hosts_email_live",
            "email",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(Text)
    # Unique among LIVE accounts only — see __table_args__. A column-level
    # UNIQUE (the old hosts_email_key) would have let an archived account go on
    # holding its address forever, so an agency that left and came back could
    # never be invited under the same email again.
    email: Mapped[str] = mapped_column(Text)
    password_hash: Mapped[str] = mapped_column(Text)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    # Shown in the member feed's organization stepper. Null falls back to the
    # organization's initials.
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Archived, not destroyed — same rule as Event and User. The account has to
    # outlive its removal because its programs carry host_id as their
    # attribution, and "which agency ran this" is what goes in a grant
    # application. Removing the row instead would cascade those programs away.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    events = relationship(
        "Event", back_populates="host", cascade="all, delete-orphan"
    )
