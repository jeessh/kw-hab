"""Extra details a listing can carry beyond its description.

Revision ID: 0007_notes
Revises: 0006_logos_activity
Create Date: 2026-08-13

The grid view's detail popup shows a NOTES block under the description. It is
deliberately separate: the description is the standardized, word-limited pitch
every listing has, and notes is where the things that vary — what to bring, who
to ask for, access particulars — go without bloating the card everyone sees.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_notes"
down_revision: Union[str, None] = "0006_logos_activity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("events", sa.Column("notes", sa.Text()))


def downgrade() -> None:
    op.drop_column("events", "notes")
