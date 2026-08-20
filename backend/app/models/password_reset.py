import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class HostPasswordReset(Base):
    """A pending password reset for an organizer account.

    Same shape as HostInvite: only the hash of the token is stored, so a copy of
    this table is not a set of working reset links. Single use, and short-lived
    — an invitation is something you wait to act on, a reset is something you
    asked for a minute ago.
    """

    __tablename__ = "host_password_resets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    token_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    # Cascades: a reset is meaningless without the account, carries nothing
    # anyone reports on, and hosts are archived rather than deleted anyway.
    host_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("hosts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
