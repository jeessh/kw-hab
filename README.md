# The Belonging Collective

An accessible, needs-first platform where Kitchener-Waterloo nonprofits post
community programming and members discover what fits them. Built for a one-day
hackathon with KW Hab.

## Member experience

One big card at a time. To attend a program: drag the card into the slot, press
and hold it (2s), or hold the ↓ arrow key (1.5s) — all resolve to the same "drop
into the slot → you're attending" moment, no forms. Arrows move between programs;
the person icon opens settings.

Sign-up asks only for first and last name; the member then picks a 2-icon key
(e.g. 🌳🐱 = `tree_cat`), and those icons *are* the password. Forgotten it? Staff
re-issue a new key from the admin console — there is no email on a member
account to send anything to.

## Stack
- **Frontend:** Next.js (App Router) · Tailwind · Framer Motion — see [`frontend/`](frontend)
- **Backend:** FastAPI · SQLAlchemy — see [`backend/`](backend)
- **Database + storage:** Supabase Postgres (used as the DB; auth is custom, cookie-based)

## Run it locally

```bash
# 1. Backend  (http://localhost:8000)
cd backend
python3 -m venv .venv          # needs Python 3.10+; macOS system 3.9 crashes at
                               # import on the `X | None` type unions
.venv/bin/pip install -r requirements.txt

# Create backend/.env (gitignored, no example file to copy) with at least:
#   DATABASE_URL=postgresql+psycopg://...
#   JWT_SECRET=<any long random string>

.venv/bin/alembic upgrade head # applies the schema (Alembic owns it)
.venv/bin/python -m app.seed   # optional sample data; idempotent
.venv/bin/uvicorn app.main:app --reload

# 2. Frontend (http://localhost:3000)
cd ../frontend
npm install
npm run dev                    # no env file needed locally — lib/api.ts
                               # defaults to http://localhost:8000
```

See [`backend/README.md`](backend/README.md) for the data model, permissions, and
API reference.

## Deploy (Vercel)

One project via [Services](https://vercel.com/docs/services) (root [`vercel.json`](vercel.json)):
`/api/*` routes to the FastAPI backend, everything else to the Next.js frontend.
Shared origin keeps the `SameSite=Lax` auth cookie working.

Production env vars:

| Service  | Var | Value |
|---|---|---|
| backend  | `DATABASE_URL` | Supabase pooler string, port 6543, `postgresql+psycopg://…` |
| backend  | `JWT_SECRET` | same as `backend/.env` |
| backend  | `COOKIE_SECURE` | `true` |
| backend  | `ROOT_PATH` | `/api` |
| backend  | `FRONTEND_ORIGIN` | deployed URL (for CORS) |
| frontend | `NEXT_PUBLIC_API_URL` | `/api` |
| backend  | `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `MAIL_FROM` | organizer password-reset mail. **Unset = nothing is sent and the reset link is logged instead** |

## Roles
- **Members** — discover + attend programs (simple icon sign-in)
- **Admins** — nonprofit organizers who add and edit their own programs
- **Superadmins** — admins who can also edit any program and manage member and
  admin accounts

Organizer accounts are created by a superadmin from the admin console, or by
invitation; there is no self-serve host sign-up. Organizers who forget their
password reset it by email. Removing an admin archives the account and its
programs together — nothing is deleted, and the programs stay attributed to the
organization that ran them rather than moving to whoever pressed Remove.
