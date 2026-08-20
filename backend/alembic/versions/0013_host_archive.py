"""Archive host accounts instead of destroying them.

Removing an organizer used to reassign every program they had published to
whichever superadmin pressed the button, because Host.events cascades
delete-orphan and deleting the row outright would have taken the programs with
it. That put one agency's programming under another agency's name — and the
attribution is what the agencies report to funders.

The account is archived instead, so its programs keep pointing at the
organization that actually ran them.

The email UNIQUE moves to a partial index over live rows only. Left as a plain
column constraint, an archived account would hold its address forever and an
agency that left could never be invited back under it.

Revision ID: 0013_host_archive
Revises: 0012_event_categories
"""

import sqlalchemy as sa
from alembic import op

revision = "0013_host_archive"
down_revision = "0012_event_categories"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "hosts",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Named explicitly rather than via drop_constraint's default, because the
    # constraint on the hand-provisioned database is the Postgres-generated
    # hosts_email_key. IF EXISTS keeps this idempotent against a database that
    # was built without it.
    op.execute("ALTER TABLE hosts DROP CONSTRAINT IF EXISTS hosts_email_key")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_hosts_email_live "
        "ON hosts (email) WHERE deleted_at IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_hosts_email_live")
    # Only restorable if no two rows share an address, which archiving may have
    # made possible. Deliberately left to fail loudly rather than silently
    # dropping rows to make room for the constraint.
    op.create_unique_constraint("hosts_email_key", "hosts", ["email"])
    op.drop_column("hosts", "deleted_at")
