"""A program can be about more than one thing.

Agencies kept wanting both — a wellness walk that is also a social, a cooking
class that is also a youth program — and a single category forced them to drop
one. The member feed matches interests against these, so dropping one is the
difference between a program reaching someone and not.

`category` stays and stays populated with the first entry. Interest matching,
the topic stepper and the console filters all read it, and a column that half
the codebase still queries is not something to remove in the same change that
introduces its replacement.

Revision ID: 0012_event_categories
Revises: 0011_series_pricing
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012_event_categories"
down_revision: Union[str, None] = "0011_series_pricing"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column(
            "categories",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
    )
    # Backfill from the single category so nothing loses its topic.
    op.execute(
        """
        UPDATE events
           SET categories = ARRAY[category]
         WHERE category IS NOT NULL
           AND category <> ''
           AND cardinality(categories) = 0
        """
    )


def downgrade() -> None:
    op.drop_column("events", "categories")
