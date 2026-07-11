-- KW Community Compass — schema for the Supabase SQL editor.
-- (The FastAPI app can also auto-create these via SQLAlchemy on startup;
--  this file is here if you prefer to run the DDL yourself.)

create extension if not exists "pgcrypto";  -- for gen_random_uuid()

-- Community members. The 3-icon set is the globally-unique identifier.
create table if not exists users (
    id            uuid primary key default gen_random_uuid(),
    first_name    text not null,
    last_name     text not null,
    username      text not null,                       -- firstname_lastname (NOT unique)
    password_hash text not null,
    auth_type     text not null default 'icon',        -- 'icon' | 'password'
    icons         text[] not null,
    accessibility_prefs text[] not null default '{}',   -- onboarding prefs (sort, not filter)
    interest_categories text[] not null default '{}',
    tts_enabled            boolean not null default false,  -- read events aloud
    voice_commands_enabled boolean not null default false,  -- voice navigation
    eye_tracking_enabled   boolean not null default false,  -- gaze dwell navigation
    created_at    timestamptz not null default now(),
    constraint uq_users_icons unique (icons)
);
create index if not exists ix_users_username on users (username);

-- Organizers / nonprofit staff. Admins are hosts with is_admin = true.
create table if not exists hosts (
    id            uuid primary key default gen_random_uuid(),
    name          text not null,
    email         text not null unique,
    password_hash text not null,
    is_admin      boolean not null default false,
    created_at    timestamptz not null default now()
);

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
    requires_signup     boolean not null default false,  -- true = member must sign up
    cover_image_url     text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);
create index if not exists ix_events_host on events (host_id);
create index if not exists ix_events_category on events (category);

-- Gallery images for an event (cover image lives on events.cover_image_url).
create table if not exists event_images (
    id         uuid primary key default gen_random_uuid(),
    event_id   uuid not null references events(id) on delete cascade,
    url        text not null,
    caption    text,
    sort_order integer not null default 0
);
create index if not exists ix_event_images_event on event_images (event_id);

-- Junction: a user plans to attend an event (many-to-many).
create table if not exists event_attendees (
    user_id    uuid not null references users(id) on delete cascade,
    event_id   uuid not null references events(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, event_id)
);
