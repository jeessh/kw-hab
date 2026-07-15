# KW Community Compass — Backend

FastAPI + SQLAlchemy on Supabase Postgres (database only, not Supabase Auth).

## Data model

- `users` — members; unique on **(`username`, `icons`)** — people can share a
  name, or an icon set, but not both
- `hosts` — organizers; `is_admin=true` ⇒ admin
- `events` — programming; `accessibility_tags[]`, `cover_image_url` + ordered
  `event_images` gallery
- `event_attendees` — users ⇄ events they plan to attend (composite PK)

## Auth

Members enter first + last name and pick an **ordered** 3-icon key; that pair
is the credential. `POST /auth/user` logs in when name + icons match an
existing account and creates one otherwise (returns `mode: "login" | "signup"`).
The legacy split endpoints (`/auth/signup/user` with server-generated icons,
`/auth/login/user` with username + password) still work but have no frontend
caller.

The session is an httpOnly `SameSite=Lax` JWT cookie: callers send
`credentials: "include"` and must stay same-origin (or set `COOKIE_SECURE=true`
behind HTTPS).

## Run

```bash
cd backend                    # needs Python 3.10+
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# create .env with DATABASE_URL and JWT_SECRET
python3 -m app.seed
uvicorn app.main:app --reload
```

Interactive docs: http://localhost:8000/docs

## Endpoints

- `POST /auth/user` `{first_name, last_name, icons}` → login-or-signup, sets
  cookie (`/auth/signup/user` and `/auth/login/user` are legacy)
- `POST /auth/signup/host` · `POST /auth/login/host` · `POST /auth/logout` ·
  `GET /auth/me`
- `GET /events?category=&tag=&free=&q=` (public) · `POST /events` (host) ·
  `PATCH/DELETE /events/{id}` (owner/admin)
- `POST/DELETE /events/{id}/attend` (user) · `GET /users/me/events`
- `GET /users` · `PATCH /users/{id}` · `DELETE /users/{id}` (admin)
