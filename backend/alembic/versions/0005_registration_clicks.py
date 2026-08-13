"""Count follow-throughs on outbound registration links.

Revision ID: 0005_clicks
Revises: 0004_registration
Create Date: 2026-08-13

When a program registers on the agency's own site, the click is the last thing
this platform can observe. It stands in for "signed up" — half of the adoption
number nonprofits report to funders — so the table is append-only and has no
delete path.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_clicks"
down_revision: Union[str, None] = "0004_registration"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "event_registration_clicks",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "event_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id"),
            nullable=False,
        ),
        # Null for a signed-out visitor — the event page is public.
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column(
            "clicked_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_registration_clicks_event", "event_registration_clicks", ["event_id"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_registration_clicks_event", table_name="event_registration_clicks"
    )
    op.drop_table("event_registration_clicks")
