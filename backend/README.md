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
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then paste your Supabase DATABASE_URL + a JWT_SECRET
python3 -m app.seed
uvicorn app.main:app --reload
```

Interactive docs: http://localhost:8000/docs

## Key endpoints
- `POST /auth/signup/user` `{first_name, last_name, custom_password?}` → returns the icons, sets cookie
- `POST /auth/login/user` `{username, password}`
- `POST /auth/signup/host` · `POST /auth/login/host` · `POST /auth/logout` · `GET /auth/me`
- `GET /events?category=&tag=&free=&q=` (public) · `POST /events` (host) · `PATCH/DELETE /events/{id}` (owner/admin)
- `POST/DELETE /events/{id}/attend` (user) · `GET /users/me/events`
- `GET /users` · `PATCH /users/{id}` · `DELETE /users/{id}` (admin)

## Auth cookie
`httpOnly` + `SameSite=Lax`. Callers send `credentials: "include"`; keep the API
same-origin (or set `COOKIE_SECURE=true` behind HTTPS) so the cookie flows.
