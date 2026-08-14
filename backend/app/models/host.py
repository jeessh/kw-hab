import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Host(Base):
    """An organizer / nonprofit staff account. Admins are hosts with is_admin=True."""

    __tablename__ = "hosts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String)
    # unique without index=True: the live DB enforces this with a column-level
    # UNIQUE constraint (hosts_email_key), which already carries an index.
    # index=True would additionally declare ix_hosts_email in metadata, which
    # the database doesn't have — and autogenerate would keep proposing it.
    email: Mapped[str] = mapped_column(String, unique=True)
    password_hash: Mapped[str] = mapped_column(String)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    # Shown in the member feed's organization stepper. Null falls back to the
    # organization's initials.
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    events = relationship(
        "Event", back_populates="host", cascade="all, delete-orphan"
    )
