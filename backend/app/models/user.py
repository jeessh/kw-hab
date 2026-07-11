import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class User(Base):
    """A community member. The 3-icon set is the globally-unique identifier;
    usernames (firstname_lastname) are NOT unique — people can share a name."""

    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("icons", name="uq_users_icons"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    first_name: Mapped[str] = mapped_column(String)
    last_name: Mapped[str] = mapped_column(String)
    username: Mapped[str] = mapped_column(String, index=True)  # firstname_lastname
    password_hash: Mapped[str] = mapped_column(String)
    # 'icon' (default) means password is the icon slugs; 'password' means custom.
    auth_type: Mapped[str] = mapped_column(String, default="icon")
    # ARRAY(Text) not ARRAY(String): the DB columns are text[], and equality
    # filters (see _allocate_unique_icons) bind the literal with the column's
    # type — String binds varchar[], which has no `text[] = varchar[]` operator.
    icons: Mapped[list[str]] = mapped_column(ARRAY(Text))  # unique identifier
    # Personalization prefs set during onboarding. Free-form slugs (the FE chip
    # taxonomy constrains input); used to SORT the feed, never to filter it.
    accessibility_prefs: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, default=list, server_default="{}"
    )
    interest_categories: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, default=list, server_default="{}"
    )
    # Voice-accessibility prefs — persisted to profile, toggled in settings.
    tts_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    voice_commands_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    attending = relationship(
        "Attendance", back_populates="user", cascade="all, delete-orphan"
    )
