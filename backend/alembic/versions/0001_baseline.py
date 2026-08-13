"""Baseline: the five tables as they already exist in Supabase.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-08-13

Deliberately idempotent (`create table if not exists`, mirroring the old
backend/schema.sql). The live database was provisioned by hand before Alembic
existed, so `alembic upgrade head` has to be safe to run against it — this
revision is a no-op there and only does real work on a fresh database. That
avoids the "remember to `alembic stamp`" step, which is exactly the kind of
thing that gets forgotten once and then corrupts the migration history.

Autogenerate compares against the models from here on, so later revisions are
ordinary op.* calls.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('create extension if not exists "pgcrypto"')

    op.execute(
        """
        create table if not exists users (
            id            uuid primary key default gen_random_uuid(),
            first_name    text not null,
            last_name     text not null,
            username      text not null,
            password_hash text not null,
            auth_type     text not null default 'icon',
            icons         text[] not null,
            accessibility_prefs text[] not null default '{}',
            interest_categories text[] not null default '{}',
            tts_enabled            boolean not null default false,
            voice_commands_enabled boolean not null default false,
            eye_tracking_enabled   boolean not null default false,
            created_at    timestamptz not null default now(),
            constraint uq_users_username_icons unique (username, icons)
        )
        """
    )
    op.execute("create index if not exists ix_users_username on users (username)")

    op.execute(
        """
        create table if not exists hosts (
            id            uuid primary key default gen_random_uuid(),
            name          text not null,
            email         text not null unique,
            password_hash text not null,
            is_admin      boolean not null default false,
            created_at    timestamptz not null default now()
        )
        """
    )

    op.execute(
        """
        create table if not exists events (
            id                  uuid primary key default gen_random_uuid(),
            host_id             uuid not null references hosts(id) on delete cascade,
            title               text not null,
            description         text not null default '',
            category            text,
            location            text,
            starts_at           timestamptz,
            ends_at             timestamptz,
            accessibility_tags  text[] not null default '{}',
            is_free             boolean not null default true,
            requires_signup     boolean not null default false,
            cover_image_url     text,
            created_at          timestamptz not null default now(),
            updated_at          timestamptz not null default now()
        )
        """
    )
    op.execute("create index if not exists ix_events_host on events (host_id)")
    op.execute("create index if not exists ix_events_category on events (category)")

    op.execute(
        """
        create table if not exists event_images (
            id         uuid primary key default gen_random_uuid(),
            event_id   uuid not null references events(id) on delete cascade,
            url        text not null,
            caption    text,
            sort_order integer not null default 0
        )
        """
    )
    op.execute(
        "create index if not exists ix_event_images_event on event_images (event_id)"
    )

    op.execute(
        """
        create table if not exists event_attendees (
            user_id    uuid not null references users(id) on delete cascade,
            event_id   uuid not null references events(id) on delete cascade,
            created_at timestamptz not null default now(),
            primary key (user_id, event_id)
        )
        """
    )


def downgrade() -> None:
    # No downgrade. This revision's whole job is to describe a database that
    # already exists and holds real member accounts and attendance history;
    # dropping those tables is never the right recovery from a failed migration.
    raise NotImplementedError("The baseline revision is not reversible.")
