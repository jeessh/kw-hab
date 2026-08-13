from datetime import datetime

from sqlalchemy import DateTime, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class AuthRateLimit(Base):
    """Fixed-window counter for failed auth attempts.

    Kept in Postgres rather than in memory because the backend runs as
    serverless functions — an in-process counter resets on every cold start and
    isn't shared between concurrent instances, which is precisely the situation
    an attacker's parallel requests land in.
    """

    __tablename__ = "auth_rate_limits"

    # "user:jane_doe", "host:a@b.org", "ip:1.2.3.4" — the thing being protected,
    # not the thing being counted.
    key: Mapped[str] = mapped_column(Text, primary_key=True)
    window_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
