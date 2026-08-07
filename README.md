# KW Community Compass

An accessible, needs-first platform where Kitchener-Waterloo nonprofits post
community programming and members discover what fits them. Built for a one-day
hackathon with KW Hab.

## Member experience

One big card at a time. To attend a program: drag the card into the slot, press
and hold it (2s), or hold the ↓ arrow key (1.5s) — all resolve to the same "drop
into the slot → you're attending" moment, no forms. Arrows move between programs;
the person icon opens settings.

Sign-up asks only for first and last name; the app generates a 3-icon key
(e.g. 🌳🐱🍎 = `tree_cat_apple`) as the password.

## Stack
- **Frontend:** Next.js (App Router) · Tailwind · Framer Motion — see [`frontend/`](frontend)
- **Backend:** FastAPI · SQLAlchemy — see [`backend/`](backend)
- **Database + storage:** Supabase Postgres (used as the DB; auth is custom, cookie-based)

## Run it locally

```bash
# 1. Backend  (http://localhost:8000)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # paste your Supabase DATABASE_URL + a JWT_SECRET
python -m app.seed          # optional sample data
uvicorn app.main:app --reload

# 2. Frontend (http://localhost:3000)
cd ../frontend
npm install
cp .env.local.example .env.local
npm run dev
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

## Roles
- **Members** — discover + attend programs (simple icon sign-in)
- **Admins** — nonprofit organizers who add and edit their own programs
- **Superadmins** — admins who can also edit any program and manage member and
  admin accounts

Organizer accounts are created by a superadmin from the admin console; there is
no self-serve host sign-up. Removing an admin hands their programs to the
superadmin doing the removal rather than deleting them.
