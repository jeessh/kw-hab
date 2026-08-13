"""Failed-auth counters, so the 3-icon key can't be exhausted by script.

Revision ID: 0003_rate_limits
Revises: 0002_archive
Create Date: 2026-08-13

The counter lives in Postgres rather than in process memory because the backend
runs as serverless functions: an in-process counter resets on every cold start
and isn't shared between concurrent instances, which is exactly where an
attacker's parallel requests land.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_rate_limits"
down_revision: Union[str, None] = "0002_archive"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "auth_rate_limits",
        sa.Column("key", sa.Text(), primary_key=True),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("auth_rate_limits")
