# KW Community Compass — Backend

FastAPI + SQLAlchemy on Supabase Postgres (database only, not Supabase Auth).

## Data model

- `users` — members; the 3-icon set is the **unique identifier**, `username`
  (firstname_lastname) is not unique
- `hosts` — organizers; `is_admin=true` ⇒ admin
- `events` — programming; `accessibility_tags[]`, `cover_image_url` + ordered
  `event_images` gallery
- `event_attendees` — users ⇄ events they plan to attend (composite PK)

## Auth

Signup takes first + last name; the server generates the username and a unique
random 3-icon set (e.g. `tree_cat_apple`), which joined by `_` is the default
password (a custom password is optional). Login checks the password against
every user sharing the username — names may repeat, icons never do.

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

- `POST /auth/signup/user` `{first_name, last_name, custom_password?}` →
  returns the icons, sets cookie
- `POST /auth/login/user` · `POST /auth/signup/host` · `POST /auth/login/host` ·
  `POST /auth/logout` · `GET /auth/me`
- `GET /events?category=&tag=&free=&q=` (public) · `POST /events` (host) ·
  `PATCH/DELETE /events/{id}` (owner/admin)
- `POST/DELETE /events/{id}/attend` (user) · `GET /users/me/events`
- `GET /users` · `PATCH /users/{id}` · `DELETE /users/{id}` (admin)
