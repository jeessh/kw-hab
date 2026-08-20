"""Stop a stray DELETE from taking attendance history with it.

event_attendees pointed at users and events with ON DELETE CASCADE. Nothing in
the API hard-deletes either any more — both archive — so this was unreachable
through the app. It was still one `delete from users where ...` in the Supabase
SQL editor away from erasing the numbers agencies report to funders, silently
and with no way back.

RESTRICT makes that statement fail instead. It also covers hosts transitively:
events.host_id still cascades from hosts, so deleting a host row reaches
event_attendees and is refused there, taking the whole statement down with it.

Revision ID: 0015_attendance_fk_restrict
Revises: 0014_host_password_resets
"""

from alembic import op

revision = "0015_attendance_fk_restrict"
down_revision = "0014_host_password_resets"
branch_labels = None
depends_on = None


# Postgres has no ALTER CONSTRAINT for the delete rule, so each one is dropped
# and recreated. Names are the Postgres-generated defaults, confirmed against
# the live database rather than assumed.
def upgrade() -> None:
    op.execute(
        "ALTER TABLE event_attendees "
        "DROP CONSTRAINT IF EXISTS event_attendees_user_id_fkey"
    )
    op.execute(
        "ALTER TABLE event_attendees ADD CONSTRAINT event_attendees_user_id_fkey "
        "FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT"
    )
    op.execute(
        "ALTER TABLE event_attendees "
        "DROP CONSTRAINT IF EXISTS event_attendees_event_id_fkey"
    )
    op.execute(
        "ALTER TABLE event_attendees ADD CONSTRAINT event_attendees_event_id_fkey "
        "FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE RESTRICT"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE event_attendees "
        "DROP CONSTRAINT IF EXISTS event_attendees_user_id_fkey"
    )
    op.execute(
        "ALTER TABLE event_attendees ADD CONSTRAINT event_attendees_user_id_fkey "
        "FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE"
    )
    op.execute(
        "ALTER TABLE event_attendees "
        "DROP CONSTRAINT IF EXISTS event_attendees_event_id_fkey"
    )
    op.execute(
        "ALTER TABLE event_attendees ADD CONSTRAINT event_attendees_event_id_fkey "
        "FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE"
    )
