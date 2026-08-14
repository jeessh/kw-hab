"""Organization logos, and what kind of activity a program is.

Revision ID: 0006_logos_activity
Revises: 0005_clicks
Create Date: 2026-08-13

Two things the member feed's design needs and the schema couldn't express:

* `hosts.logo_url` — the stepper above the card identifies organizations by
  their logo. Without a column it fell back to coloured initials.
* `events.activity_type` — "Activity Type" is one of the six ways to group the
  feed. It is not `category`: category is the topic (Cooking, Sports), activity
  type is the shape of the thing (a class, a drop-in social, an outing). Both
  matter for "is this for me?" and neither substitutes for the other.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_logos_activity"
down_revision: Union[str, None] = "0005_clicks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("hosts", sa.Column("logo_url", sa.Text()))
    op.add_column("events", sa.Column("activity_type", sa.Text()))
    op.create_index(
        "ix_events_activity_type", "events", ["activity_type"]
    )


def downgrade() -> None:
    op.drop_index("ix_events_activity_type", table_name="events")
    op.drop_column("events", "activity_type")
    op.drop_column("hosts", "logo_url")
