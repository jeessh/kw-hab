"""Invitation links for organizer accounts.

Revision ID: 0010_invites
Revises: 0009_capacity_place_age
Create Date: 2026-08-14

Until now a superadmin created the account and read the password out loud, which
means the password is known to two people from the moment it exists and nobody
is ever made to change it. An invite lets the agency set their own: the link
carries a one-time token, the account is created when they accept, and nothing
travels except the link.

Only a hash of the token is stored, for the same reason passwords are hashed —
a leaked database shouldn't hand over working invitations.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_invites"
down_revision: Union[str, None] = "0009_capacity_place_age"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "host_invites",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("token_hash", sa.Text(), nullable=False, unique=True),
        sa.Column("organization", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False,
                  server_default=sa.text("false")),
        sa.Column(
            "invited_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("hosts.id"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
    )


def downgrade() -> None:
    op.drop_table("host_invites")
