# KW Community Compass

Accessible, needs-first platform where Kitchener-Waterloo nonprofits post
community programming and members discover what fits them. Hackathon build
with KW Hab.

One big card at a time: drag it into the slot, press and hold it, or hold ↓ —
all end in the same "drop into the slot → you're attending" moment, no forms.
Members enter their name and pick a 3-icon key (🌳🐱🍎) — that pair is the
credential, and one call either logs them in or creates the account.

## Stack

- [`frontend/`](frontend) — Next.js (App Router) · Tailwind · Framer Motion
- [`backend/`](backend) — FastAPI · SQLAlchemy · Supabase Postgres (database
  only; auth is custom, cookie-based)

## Run locally

```bash
# Backend → http://localhost:8000   (needs Python 3.10+)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# create .env with DATABASE_URL and JWT_SECRET
python -m app.seed          # optional sample data
uvicorn app.main:app --reload

# Frontend → http://localhost:3000
cd ../frontend
npm install
npm run dev
```

Data model and API reference: [`backend/README.md`](backend/README.md).

## Deploy (Vercel)

One project via the root [`vercel.json`](vercel.json): `/api/*` routes to the
backend, everything else to the frontend. The shared origin keeps the
`SameSite=Lax` auth cookie working.

Production env — backend: `DATABASE_URL` (Supabase pooler :6543,
`postgresql+psycopg://…`), `JWT_SECRET`, `COOKIE_SECURE=true`, `ROOT_PATH=/api`,
`FRONTEND_ORIGIN`; frontend: `NEXT_PUBLIC_API_URL=/api`.

## Roles

**Members** discover + attend programs (icon sign-in) · **hosts** manage their
own programs · **admins** (hosts with `is_admin`) manage any program and any
member account.
