"""Capacity, where a program is, and who it's for.

Revision ID: 0009_capacity_place_age
Revises: 0008_audience
Create Date: 2026-08-14

Three filters members were described as applying in their heads and the schema
couldn't answer: is there room, can I get there, is this my age.

Coordinates rather than PostGIS: at seven agencies a Haversine sort over a few
hundred rows is instant, and PostGIS is an extension to install and learn for a
distance calculation that fits in a WHERE clause.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_capacity_place_age"
down_revision: Union[str, None] = "0008_audience"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Null means "no limit", which is different from zero.
    op.add_column("events", sa.Column("capacity", sa.Integer()))
    op.add_column("events", sa.Column("latitude", sa.Float()))
    op.add_column("events", sa.Column("longitude", sa.Float()))
    # Null on either side is open-ended: min 55 with no max is "55 and up".
    op.add_column("events", sa.Column("min_age", sa.Integer()))
    op.add_column("events", sa.Column("max_age", sa.Integer()))


def downgrade() -> None:
    for col in ("max_age", "min_age", "longitude", "latitude", "capacity"):
        op.drop_column("events", col)
