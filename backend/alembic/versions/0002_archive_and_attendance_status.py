"""Archive instead of destroy, and keep a record of every save.

Revision ID: 0002_archive
Revises: 0001_baseline
Create Date: 2026-08-13

Attendance numbers are what nonprofits put in grant applications, so they have
to outlive the things they hang off:

  * events.deleted_at / users.deleted_at — deleting archives rather than
    destroys, so the attendance rows are never cascaded away.
  * event_attendees.status — un-saving flips the status instead of deleting the
    row, so "how many people saved this" stays a cumulative number rather than a
    live count that quietly walks backwards.
  * an event_id-leading index — the primary key is (user_id, event_id), so every
    per-event count was a sequential scan.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_archive"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("events", sa.Column("deleted_at", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(timezone=True)))

    # 'saved' | 'removed'. 'registered' joins these when the registration modes
    # land — the column is text rather than an enum so adding it is a code
    # change, not another migration.
    op.add_column(
        "event_attendees",
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'saved'"),
        ),
    )

    op.create_index(
        "ix_event_attendees_event", "event_attendees", ["event_id"]
    )
    # The feed and the per-member list both read "live rows only"; a partial
    # index keeps those from scanning archived ones as the table grows.
    op.execute(
        "create index if not exists ix_events_live on events (starts_at) "
        "where deleted_at is null"
    )


def downgrade() -> None:
    op.execute("drop index if exists ix_events_live")
    op.drop_index("ix_event_attendees_event", table_name="event_attendees")
    op.drop_column("event_attendees", "status")
    op.drop_column("users", "deleted_at")
    op.drop_column("events", "deleted_at")
