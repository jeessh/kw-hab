"""Whether a program is virtual, and whether it's for youth.

Revision ID: 0008_audience
Revises: 0007_notes
Create Date: 2026-08-14

The create form sets four tag pairs, and two of them had nowhere to go:
Virtual/In-Person and Youth/Everyone. Both are filters on the admin list and
both are things a member needs before deciding — "can I get there" and "is this
for me" — so they're columns rather than free tags.

Booleans rather than a tag array because each is a genuine either/or, and a
NOT NULL default keeps every existing program answering the question.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_audience"
down_revision: Union[str, None] = "0007_notes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column(
            "is_virtual",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "events",
        sa.Column(
            "is_youth",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("events", "is_youth")
    op.drop_column("events", "is_virtual")
