# KW Community Compass — Backend

FastAPI + SQLAlchemy on Supabase Postgres (database only, not Supabase Auth).
Custom cookie auth supports the icon / username login scheme.

## Data model

| Table | Purpose | Key points |
|---|---|---|
| `users` | Community members | 3-icon set is the **unique identifier**; `username` (firstname_lastname) is not unique |
| `hosts` | Organizers / nonprofit staff | `is_admin=true` ⇒ admin |
| `events` | Programming | `cover_image_url` + `event_images` gallery, `accessibility_tags[]` |
| `event_images` | Event gallery | ordered by `sort_order` |
| `event_attendees` | Users ⇄ events they plan to attend | composite PK |

### Permissions
- **admin** (host with `is_admin`) → modify any event + any user account
- **host** → CRUD their own events
- **user** → manage their own attendance

### Member auth
On signup a member gives only first + last name. The server generates a
`firstname_lastname` username and a **unique** random 3-icon set (e.g.
`tree_cat_apple`); the default password is those icons joined by `_`. A custom
password is optional. Login is username + password, checked against every user
sharing that username (names may repeat; icons never do).

## Run it

```bash
cd backend
python3 -m venv .venv         # needs Python 3.10+; macOS system 3.9 crashes at
                              # import on the `X | None` type unions
.venv/bin/pip install -r requirements.txt

# Create backend/.env (gitignored, there is no example file to copy):
#   DATABASE_URL=postgresql+psycopg://...   # :5432 session pooler for local
#   JWT_SECRET=<any long random string>     # no default — the app won't start

.venv/bin/python -m app.seed  # idempotent; skips if hosts already exist
.venv/bin/uvicorn app.main:app --reload
```

Call the venv binaries directly rather than activating — it's the difference
between running 3.12 and whatever `python3` happens to be on PATH.

Interactive docs: http://localhost:8000/docs

## Key endpoints
- `POST /auth/signup/user` `{first_name, last_name, custom_password?}` → returns the icons, sets cookie
- `POST /auth/login/user` `{username, password}`
- `POST /auth/login/host` · `POST /auth/logout` · `GET /auth/me`
  (no host signup route — superadmins create organizer accounts via `POST /hosts`)
- `GET /events?category=&tag=&free=&q=` (public) · `POST /events` (host) · `PATCH/DELETE /events/{id}` (owner/admin)
- `POST/DELETE /events/{id}/attend` (user) · `GET /users/me/events`
- `GET /users` · `PATCH /users/{id}` · `DELETE /users/{id}` (superadmin)
- `GET /hosts` · `POST /hosts` · `PATCH /hosts/{id}` · `DELETE /hosts/{id}` (superadmin)

## Admin tiers
Both live on `hosts`; there is no third table or column.
- **admin** (`is_admin = false`) — creates and manages only its own programs.
- **superadmin** (`is_admin = true`) — manages any program, plus member accounts
  and other admins.

Removing an admin **reassigns their programs to the acting superadmin** rather
than deleting them (`hosts.events` cascades, and members may already have saved
those programs). A superadmin cannot demote or delete themselves, which is what
keeps at least one superadmin in the system — you can only ever remove someone
else's rights, so your own survive.

## Auth cookie
`httpOnly` + `SameSite=Lax`. Callers send `credentials: "include"`; keep the API
same-origin (or set `COOKIE_SECURE=true` behind HTTPS) so the cookie flows.
