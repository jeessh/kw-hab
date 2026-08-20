# The Belonging Collective — Backend

FastAPI + SQLAlchemy on Supabase Postgres (database only, not Supabase Auth).
Custom cookie auth supports the icon / username login scheme.

## Data model

| Table | Purpose | Key points |
|---|---|---|
| `users` | Community members | credential is **`username` + the ordered icons together** (`uq_users_username_icons`); neither is unique alone. `deleted_at` archives |
| `hosts` | Organizers / nonprofit staff | `is_admin=true` ⇒ superadmin. `deleted_at` archives; `email` is unique over **live rows only** (`uq_hosts_email_live`) |
| `events` | Programming | `cover_image_url` + `event_images` gallery, `accessibility_tags[]`, pricing template, capacity, `deleted_at` |
| `event_images` | Event gallery | ordered by `sort_order` |
| `event_attendees` | Users ⇄ events they plan to attend | composite PK; un-saving sets `status='removed'` rather than deleting |
| `host_invites` | Pending organizer invitations | token hash only, single use |
| `host_password_resets` | Pending organizer password resets | token hash only, single use, 1-hour expiry |
| `event_registration_clicks` | Outbound registration-link clicks | append-only |
| `auth_rate_limits` | Failure counters for the sign-in routes | keyed per identity and per IP |

### Permissions
- **admin** (host with `is_admin`) → modify any event + any user account
- **host** → CRUD their own events
- **user** → manage their own attendance

### Member auth
On signup a member gives first + last name and picks their icons. The server
derives a `firstname_lastname` username; the password is the username plus the
ordered icon slugs (`credential()` in `app/core/icons.py`).

Uniqueness is on **(username, icons) together** — two people may share a name,
and two people may share icons, as long as the pair differs. Sign-in resolves
the name first and then verifies the credential against each account carrying
it, which is why icon allocation is scoped to a username rather than global:
two ordered icons from twelve is only 132 combinations, and searching globally
would exhaust them at 132 members across every agency.

`ICON_COUNT` is the number of icons; read it rather than assuming, as it has
changed more than once.

Members have no email or phone, so the only recovery is a superadmin re-issuing
the key with `POST /users/{id}/reset-key`.

## Run it

```bash
cd backend
python3 -m venv .venv         # needs Python 3.10+; macOS system 3.9 crashes at
                              # import on the `X | None` type unions
.venv/bin/pip install -r requirements.txt

# Create backend/.env (gitignored, there is no example file to copy):
#   DATABASE_URL=postgresql+psycopg://...   # :5432 session pooler for local
#   JWT_SECRET=<any long random string>     # no default — the app won't start

.venv/bin/alembic upgrade head  # owns the schema; run before seeding
.venv/bin/python -m app.seed    # idempotent; skips if hosts already exist
.venv/bin/uvicorn app.main:app --reload
```

## Migrations

Alembic owns the schema — nothing creates tables on startup any more. After
changing a model:

```bash
.venv/bin/alembic revision --autogenerate -m "what changed"
.venv/bin/alembic upgrade head          # then deploy, then run it against prod
```

The baseline revision is written idempotently (`create table if not exists`)
because the live Supabase database was provisioned by hand before Alembic
existed, so `upgrade head` is safe to run against it and no `alembic stamp` step
is needed. `alembic/env.py` reuses the app's engine, so it inherits the
NullPool + `prepare_threshold=None` settings that the pgbouncer pooler needs,
and reads `DATABASE_URL` from `.env` rather than from `alembic.ini`.

Call the venv binaries directly rather than activating — it's the difference
between running 3.12 and whatever `python3` happens to be on PATH.

Interactive docs: http://localhost:8000/docs

## Key endpoints
- `POST /auth/user` `{first_name, last_name, icons, create_new?}` → the unified member door: logs in when the name and icons match an account, creates one when they don't, and returns `mode: "conflict"` when the name exists but the icons don't open it
- `POST /auth/signup/user` · `POST /auth/login/user` (the older split routes)
- `POST /auth/login/host` · `POST /auth/logout` · `GET /auth/me`
  (no host signup route — superadmins create organizer accounts via `POST /hosts`
  or an invitation)
- `POST /auth/host/forgot` · `GET /auth/host/reset/{token}` · `POST /auth/host/reset`
  — organizer password reset. `forgot` answers identically whether or not the
  address has an account, deliberately
- `POST /users/{id}/reset-key` (superadmin) — issue a member a new icon key
- `GET /events?category=&tag=&free=&q=` (public) · `POST /events` (host) · `PATCH/DELETE /events/{id}` (owner/admin)
- `POST/DELETE /events/{id}/attend` (user) · `GET /users/me/events`
- `GET /users` · `PATCH /users/{id}` · `DELETE /users/{id}` (superadmin)
- `GET /hosts` · `POST /hosts` · `PATCH /hosts/{id}` · `DELETE /hosts/{id}` (superadmin)

## Admin tiers
Both live on `hosts`; there is no third table or column.
- **admin** (`is_admin = false`) — creates and manages only its own programs.
- **superadmin** (`is_admin = true`) — manages any program, plus member accounts
  and other admins.

Removing an admin **archives the account and its programs together**.
`hosts.events` cascades `delete-orphan`, so deleting the row would destroy
programming members have saved and attendance the agency reports to funders.
Reassigning to the acting superadmin — what this used to do — kept the programs
visible but filed one agency's work under another's name, so both now get
`deleted_at` and the attribution survives.

A superadmin cannot demote or delete themselves, which is what keeps at least
one superadmin in the system — you can only ever remove someone else's rights,
so your own survive. That guard counts **live** superadmins only.

## Auth cookie
`httpOnly` + `SameSite=Lax`. Callers send `credentials: "include"`; keep the API
same-origin (or set `COOKIE_SECURE=true` behind HTTPS) so the cookie flows.

The token carries `cv`, a fingerprint of the password hash it was issued
against, re-checked on every request. Changing a credential — re-issuing a
member's icons, resetting an organizer's password, renaming a member — therefore
ends the sessions opened with the old one, instead of leaving them valid for the
week a token lasts. Anything that mints a token must pass `cred_hash`, or the
account it belongs to is signed out immediately.
