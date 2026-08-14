"""Recurring series, structured pricing, and a human-readable event number.

Revision ID: 0011_series_pricing
Revises: 0010_invites
Create Date: 2026-08-14

Three things the real test data needed and the schema couldn't hold:

* 34 of 37 sample events recur. Occurrences are materialized as their own rows
  sharing a `series_id`, because capacity, attendance and reminders all attach
  to a specific date — a virtual occurrence has no row to hang them on.
* 10 have real prices, in shapes a number can't express: per session, per
  group, and per series ("$40 per 8-week season"). Structured, so the last one
  can mean what it says: paying once registers you for the whole run.
* Events need an identifier a person can say out loud. UUIDs are for machines;
  `event_no` is a sequence, so it keeps counting past a deleted row and past
  archived programming.

latitude/longitude go: they were added for a proximity sort, nothing populates
them, and there's no geocoder to.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0011_series_pricing"
down_revision: Union[str, None] = "0010_invites"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("events", "latitude")
    op.drop_column("events", "longitude")

    # A sequence rather than max()+1: concurrent creates must not collide, and
    # numbers should never be reused after an archive.
    op.execute("create sequence if not exists events_event_no_seq")
    op.add_column(
        "events",
        sa.Column(
            "event_no",
            sa.BigInteger(),
            nullable=False,
            server_default=sa.text("nextval('events_event_no_seq')"),
        ),
    )
    op.create_unique_constraint("uq_events_event_no", "events", ["event_no"])

    # Every occurrence of a repeating program shares this; a one-off is its own
    # series of one, so nothing has to special-case "not a series".
    op.add_column(
        "events", sa.Column("series_id", postgresql.UUID(as_uuid=True))
    )
    # Human-readable, e.g. "Weekly (Fridays)" — kept as written so the listing
    # can say what the agency said.
    op.add_column("events", sa.Column("recurrence", sa.Text()))
    # 1-based position within the series, for "week 3 of 8".
    op.add_column("events", sa.Column("series_index", sa.Integer()))
    op.add_column("events", sa.Column("series_total", sa.Integer()))
    op.create_index("ix_events_series", "events", ["series_id"])

    # free | donation | per_session | per_group | series | custom
    op.add_column(
        "events",
        sa.Column(
            "pricing_model",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'free'"),
        ),
    )
    # Cents, so no float ever touches money.
    op.add_column("events", sa.Column("price_cents", sa.Integer()))
    # "per foursome" → 4. "$40 per 8-week season" → 8 sessions.
    op.add_column("events", sa.Column("price_group_size", sa.Integer()))
    op.add_column("events", sa.Column("price_sessions", sa.Integer()))
    # What the agency wrote, for anything the templates don't cover.
    op.add_column("events", sa.Column("price_note", sa.Text()))


def downgrade() -> None:
    for col in (
        "price_note",
        "price_sessions",
        "price_group_size",
        "price_cents",
        "pricing_model",
    ):
        op.drop_column("events", col)
    op.drop_index("ix_events_series", table_name="events")
    for col in ("series_total", "series_index", "recurrence", "series_id"):
        op.drop_column("events", col)
    op.drop_constraint("uq_events_event_no", "events", type_="unique")
    op.drop_column("events", "event_no")
    op.execute("drop sequence if exists events_event_no_seq")
    op.add_column("events", sa.Column("latitude", sa.Float()))
    op.add_column("events", sa.Column("longitude", sa.Float()))
