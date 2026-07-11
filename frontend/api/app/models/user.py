import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, UniqueConstraint, func
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
    icons: Mapped[list[str]] = mapped_column(ARRAY(String))  # unique identifier
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    attending = relationship(
        "Attendance", back_populates="user", cascade="all, delete-orphan"
    )
