"""Password resets for organizer accounts.

Until now the only way back into a locked-out organizer account was for a
superadmin to set a new password by hand — which left the sole superadmin, the
one account guaranteed to exist, with no way back in at all short of database
access.

Revision ID: 0014_host_password_resets
Revises: 0013_host_archive
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0014_host_password_resets"
down_revision = "0013_host_archive"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "host_password_resets",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("token_hash", sa.Text(), nullable=False, unique=True),
        sa.Column(
            "host_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("hosts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        if_not_exists=True,
    )
    op.create_index(
        "ix_host_password_resets_host_id",
        "host_password_resets",
        ["host_id"],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("ix_host_password_resets_host_id", "host_password_resets")
    op.drop_table("host_password_resets")
