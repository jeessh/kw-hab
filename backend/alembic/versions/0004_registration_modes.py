"""Where a program's registration actually happens.

Revision ID: 0004_registration
Revises: 0003_rate_limits
Create Date: 2026-08-13

Every event on the live KW Hab calendar links out to the hosting agency's own
registration system, and each agency runs a different one. The platform is
positioned as a directory that drives traffic to those systems, so an outbound
link is a first-class mode rather than a fallback — without it the existing
calendar's content cannot be migrated at all.

Combined with the existing `requires_signup`, this gives the four states the
member UI branches on:

    internal + no signup   → save (drop-in)
    internal + signup      → register in-platform
    external + no signup   → save (the link is informational)
    external + signup      → leave for the organizer's site, click tracked
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_registration"
down_revision: Union[str, None] = "0003_rate_limits"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column(
            "registration_mode",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'internal'"),
        ),
    )
    op.add_column("events", sa.Column("registration_url", sa.Text()))


def downgrade() -> None:
    op.drop_column("events", "registration_url")
    op.drop_column("events", "registration_mode")
