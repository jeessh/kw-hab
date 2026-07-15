# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# KW Community Compass

Accessible community-programming platform for Kitchener-Waterloo nonprofits
(hackathon build). Members discover/attend programs one card at a time;
sign-in is a 3-icon key that IS the password.

## Layout
- `backend/` — FastAPI + SQLAlchemy. **Source of truth for the API.**
- `frontend/` — Next.js (App Router) + Tailwind + Framer Motion.
- `vercel.json` (root) — single-origin deploy: `/api/*` → backend, `/*` → frontend.

## Run locally
```bash
cd backend && .venv/bin/uvicorn app.main:app --reload   # http://localhost:8000
cd frontend && npm run dev                              # http://localhost:3000
```
- The venv must be Python 3.10+ (code uses `X | None` unions; macOS system 3.9
  crashes at import).
- `backend/.env` (gitignored) holds `DATABASE_URL` + `JWT_SECRET`. Seed with
  `.venv/bin/python -m app.seed` (idempotent).
- **No test suite, linter, or CI** — verify by running the app plus
  `npm run typecheck` / `npm run build`. API docs: http://localhost:8000/docs.

## Database (Supabase)
- Ref `xybhshhcgdvfgryklsze`, pooler `aws-1-us-west-2.pooler.supabase.com` —
  **:5432 session** (local), **:6543 transaction** (Vercel). URL prefix must be
  `postgresql+psycopg://`.
- Auth is custom cookie-based (not Supabase Auth); RLS is intentionally off —
  never expose the anon key or hit the DB from the browser.
- Engine uses `NullPool` + `prepare_threshold=None` for pgbouncer compatibility.

## Same-origin deploy
Auth cookie is `SameSite=Lax` and the FE fetches with `credentials:"include"`,
so FE and BE **must share one origin**. Prod env: `DATABASE_URL` (:6543),
`JWT_SECRET`, `COOKIE_SECURE=true`, `NEXT_PUBLIC_API_URL=/api`,
`FRONTEND_ORIGIN`, `ROOT_PATH=/api` (FastAPI reads `settings.ROOT_PATH`:
`""` local, `/api` prod).

## Frontend architecture
- `components/EventsView.tsx` (~1.3k lines) is the whole member experience and
  orchestrates every accessibility mode.
- Accessibility modes are per-member toggles persisted on the user
  (`tts_enabled`, `voice_commands_enabled`, `eye_tracking_enabled`; loaded from
  `GET /auth/me`), each backed by a hook in `lib/`: `useTextToSpeech`,
  `useSpeechCommands`, `useEyeTracking`, `useHold`. Toggling PATCHes
  `/users/me` — keep the persisted pref and the active hook in sync.
- All HTTP goes through `api()` in `lib/api.ts` (`credentials:"include"`).
  Image uploads use `uploadImage()` with raw `FormData` — never force
  `Content-Type: application/json` on those.

## Gotchas
- Passwords use `bcrypt` directly — do NOT reintroduce `passlib` (crashes on
  bcrypt ≥4.1). Hashes are standard `$2b$`.
- The 3-icon set is the credential → generate with `secrets`
  (`app/core/icons.py`), never `random`. Keyspace is ~12k combos; add login
  rate-limiting before treating this as production auth.
- `JWT_SECRET` has no default — the app fails fast if unset.
- Roles: **members** (icon sign-in) · **hosts** (own programs) · **admins**
  (hosts with `is_admin`).

## Status
DB live + seeded. Deploy config present but **not yet deployed/verified** — the
root `vercel.json` `services` schema needs validation and `vercel login` is
pending.
