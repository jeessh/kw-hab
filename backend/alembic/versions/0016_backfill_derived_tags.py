"""Backfill the two accessibility tags the data already implies.

`free` and `no_registration` are not judgements about a program — they restate
`is_free` and `requires_signup`, which every event already carries. The host
form derives them on save (EventForm.payloadFrom) and the importer now does the
same, but the 273 occurrences imported from the spreadsheet predate both, so
they went in with an empty array.

That left the accessibility matching with almost nothing to match on: 174 live
events are free and did not say so in their tags, and 163 are drop-in and did
not say so either. This adds only what the row already asserts elsewhere; it
invents nothing, and it says nothing about step-free access or interpretation,
which nobody has told us either way.

Revision ID: 0016_backfill_derived_tags
Revises: 0015_attendance_fk_restrict
"""

from alembic import op

revision = "0016_backfill_derived_tags"
down_revision = "0015_attendance_fk_restrict"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The NOT ... = ANY guard is what makes this safe to re-run: an event that
    # already carries the tag is skipped rather than given a duplicate.
    op.execute(
        """
        UPDATE events
           SET accessibility_tags = accessibility_tags || ARRAY['free']::text[]
         WHERE is_free
           AND NOT ('free' = ANY(COALESCE(accessibility_tags, '{}'::text[])))
        """
    )
    op.execute(
        """
        UPDATE events
           SET accessibility_tags =
               accessibility_tags || ARRAY['no_registration']::text[]
         WHERE NOT requires_signup
           AND NOT ('no_registration' = ANY(COALESCE(accessibility_tags, '{}'::text[])))
        """
    )


def downgrade() -> None:
    # Deliberately does nothing. Once written, a backfilled tag is
    # indistinguishable from one an organizer ticked or one that arrived with
    # the original seed data, so stripping them would destroy real answers to
    # undo a derived one. The tags restate columns that are still there; if
    # they need to go, they can go by the same rule that put them here.
    pass
