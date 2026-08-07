# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# KW Community Compass

Accessible, needs-first community-programming platform for Kitchener-Waterloo
nonprofits (hackathon build). Members discover/attend programs via a tactile,
one-card-at-a-time UI; sign-in is a memorable **3-icon key that IS the password**.

## Layout
- `backend/` — FastAPI + SQLAlchemy. **Source of truth for the API.**
- `frontend/` — Next.js (App Router) + Tailwind + Framer Motion. Two distinct
  surfaces: the member app (`/`, `/signup`, `/events`) and the staff admin
  console (`/host/*`). They deliberately do not look alike — see below.
- `vercel.json` (root) — single-origin deploy: `/api/*` → backend, `/*` → frontend.

## Run locally
```bash
# backend → http://localhost:8000
cd backend && .venv/bin/uvicorn app.main:app --reload
# frontend → http://localhost:3000
cd frontend && npm run dev
```
`backend/.env` (gitignored) holds `DATABASE_URL` + `JWT_SECRET`; seed with
`.venv/bin/python -m app.seed` (idempotent; skips if hosts exist).
Frontend also has `npm run typecheck` (`tsc --noEmit`) and `npm run build`.
Interactive API docs: http://localhost:8000/docs. **There is no test suite,
linter, or CI** — verify changes by running the app and typecheck.

## Database (Supabase)
- Project ref `xybhshhcgdvfgryklsze`, region `aws-1-us-west-2`.
- Pooler host `aws-1-us-west-2.pooler.supabase.com` — **:5432 session** (local),
  **:6543 transaction** (serverless/Vercel). URL prefix must be `postgresql+psycopg://`.
- Auth is **custom cookie-based** (not Supabase Auth); RLS is intentionally off —
  never expose the anon key or hit the DB from the browser.

## Same-origin deploy (why it matters)
Auth cookie is `SameSite=Lax`, frontend fetches with `credentials:"include"`, so FE
and BE **must share one origin**. In prod set `NEXT_PUBLIC_API_URL=/api`; FastAPI
uses `settings.ROOT_PATH` (`""` local, `/api` prod).

Required prod env: `DATABASE_URL` (:6543), `JWT_SECRET`, `COOKIE_SECURE=true`,
`NEXT_PUBLIC_API_URL=/api`, `FRONTEND_ORIGIN`, `ROOT_PATH=/api`.

## Frontend architecture

### Member app
- `components/EventsView.tsx` (~1.7k lines) is the member experience — the whole
  one-card-at-a-time discovery/attend flow lives here and orchestrates every
  accessibility mode below.
- **Accessibility modes are per-member toggles**, persisted on the user (`Me.tts_enabled`,
  `voice_commands_enabled`, `eye_tracking_enabled`) and loaded from `GET /auth/me`.
  Each is a hook in `lib/`: `useTextToSpeech`, `useSpeechCommands`,
  `useHeadTracking` (head-pose cursor + `CalibrationOverlay`), `useHold`
  (press-and-hold-to-attend). Toggling a mode PATCHes `/users/me` and flips the
  hook — keep the persisted pref and the active hook in sync.
- `lib/feed.ts` orders the feed by match score (interest == `event.category`,
  pref ∈ `accessibility_tags`). **Personalization sorts, it never filters** —
  nothing is hidden. The only things that remove cards are the member's own
  explicit cost/organization filters. Ties fall back to the server's
  deterministic order, so the feed never reshuffles between renders.

### Admin console (`/host/*`)
- `components/AdminShell.tsx` is the chrome: resolves the session before
  rendering, then a persistent sidebar (Programs / Admins / Members).
  `components/AdminTable.tsx` holds the shared table/button/field primitives.
- Dense, squared-off, table-first — **deliberately not** the soft
  one-thing-at-a-time member idiom. Staff doing repetitive work want everything
  one click away; don't "harmonize" the two surfaces.
- Superadmin-only pages pass `requireSuperadmin` to `AdminShell`, which gates the
  page itself, not just the nav entry. The API refuses regardless.

### Shared
- All HTTP goes through the single `api()` helper in `lib/api.ts`
  (`credentials: "include"` for the auth cookie). Image uploads use raw `FormData`
  via `uploadImage()` — never force `Content-Type: application/json` on those.
  Render errors with `apiMessage(err, fallback)`; `ApiError.message` is the raw
  body, so printing it directly shows people `{"detail": …}`.

## Gotchas / conventions
- **Passwords use `bcrypt` directly — do NOT reintroduce `passlib`** (crashes on
  bcrypt ≥4.1). Hashes are standard `$2b$`.
- **The 3-icon set is the credential** → generate with `secrets` (see
  `app/core/icons.py`), never `random`. Keyspace is only ~12k combos; add login
  rate-limiting before treating this as production auth.
- `JWT_SECRET` has no default — the app fails fast if it's unset.
- DB engine uses `NullPool` + `prepare_threshold=None` for pgbouncer compatibility.
- **`lib/categories.ts` `CATEGORIES` is the one canonical topic list.** The signup
  interest chips, the member topic stepper, and the host category picker all read
  it. Interest matching compares a member's interests against `event.category`,
  so a category typed by hand can never match anyone — don't reintroduce a
  free-text category input, and don't start a second list.
- The persisted field is `eye_tracking_enabled` but the hook is
  **`useHeadTracking`** (head pose, not gaze — webgazer was replaced). The column
  name is legacy; don't rename it expecting the hook to follow.

## Roles and admin tiers
- **members** — icon sign-in, the `/` + `/events` experience.
- **admins** — hosts with `is_admin = false`. Create and manage only their own
  programs.
- **superadmins** — hosts with `is_admin = true`. Manage any program, plus member
  accounts and other admin accounts. `require_admin` in `app/api/deps.py` gates
  these, and it reads `is_admin` from the DB, not the token.

**There is no host signup route.** It existed and was open to the internet;
superadmins now create organizer accounts via `POST /hosts`, and `/host` is
sign-in only. Don't add one back.

Two invariants worth knowing before touching `app/api/routes/hosts.py`:
- **Removing an admin reassigns their programs to the acting superadmin.**
  `Host.events` cascades `delete-orphan`, so a plain `db.delete(host)` would
  destroy programs members have already saved.
- **A superadmin can't demote or delete themselves.** That refusal is what keeps
  at least one superadmin in the system — you can only remove someone else's
  rights, so your own survive.

## Status
DB live + seeded. The root `vercel.json` `services` schema is settled (one project,
`services.frontend` + `services.backend`, `/api/*` rewrite), but the deploy is
**still not verified against a live build** — it also needs dashboard setup that
can't be done from the repo (Framework = Services, Root Directory = repo root,
backend env vars).
