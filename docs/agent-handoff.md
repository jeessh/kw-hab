# Agent Handoff — The Belonging Collective

Self-contained briefing for spinning up additional agents. Read this + root
`CLAUDE.md` and you have full context without replaying the conversation.

## 1. Project snapshot

Accessible, needs-first community-programming platform for KW nonprofits
(hackathon build). Members discover/attend programs via a tactile,
one-card-at-a-time UI; sign-in is a memorable **3-icon key that IS the password**.

- `backend/` — FastAPI + SQLAlchemy. **Source of truth for the API.**
- `frontend/` — Next.js (App Router) + Tailwind + Framer Motion.
- `vercel.json` (root) — single-origin deploy (`/api/*` → backend, `/*` → frontend).

### What's already DONE and verified
- **Supabase DB** (ref `xybhshhcgdvfgryklsze`, region `aws-1-us-west-2`): schema
  applied (5 tables) + **seeded** — 3 hosts (`admin@kwhab.org`/`admin123` and
  `admin@admin.com`/`testtest` are superadmins, `hello@kwkitchen.org`/`host123`
  is a plain admin) and 8 events.
- **Local dev wired**: `backend/.env` has the correct pooler `DATABASE_URL`
  (:5432 session pooler). Run: `cd backend && .venv/bin/uvicorn app.main:app --reload`
  and `cd frontend && npm run dev`.
- **Backend hardening**: dropped `passlib` → direct `bcrypt` (passlib crashes on
  bcrypt ≥4.1 — do NOT reintroduce it); icon keys from `secrets` CSPRNG;
  `JWT_SECRET` required (no default); DB engine uses `NullPool` +
  `prepare_threshold=None` for pgbouncer/serverless compatibility;
  `main.py` honors `settings.ROOT_PATH` (`""` local, `/api` prod).

### What's NOT done
- **Deploy not verified against a live build.** The root `vercel.json` `services`
  schema is settled (it's the documented pattern for shipping Next.js + FastAPI
  as one project). What's outstanding is a real build plus dashboard setup that
  can't be done from the repo: Framework = Services, Root Directory = repo root,
  and the backend env vars.
- The **AI feedback interview** tab (conversational feedback capture) is designed
  but deliberately descoped — see §2.

## 2. Where the product actually landed

Interest-first discovery **shipped**. An earlier draft of this section proposed
routing `/` by auth state into `/events-dashboard` and `/get-started`; that
renaming was dropped. The routes are `/host/*` and `/signup` — see §3.

What did ship:
- Members pick interests at signup and can edit them in settings; they persist on
  `users.interest_categories`.
- The feed **sorts by match score and never filters** — nothing is hidden by
  personalization. Only the member's explicit cost/organization filters remove
  cards. This was an approved decision; don't "improve" it into a filter.
- Organizer accounts split into **admins** and **superadmins**, and the admin
  console was rebuilt as a dense, staff-facing surface.

**Descoped, still wanted:** an AI feedback tab that interviews members and
caregivers conversationally. Cut because it needs an external API. If it comes
back: the Anthropic key must stay server-side, it has to work for anonymous
users, and `useSpeechCommands` is a keyword matcher — free-form voice answers
need a sibling hook, not that one.

## 3. Architecture reference (what an implementer needs)

### Auth
- httpOnly cookie `kwcc_session` (JWT). `set_auth_cookie` in `backend/app/api/deps.py`
  (`samesite=lax`, `secure=COOKIE_SECURE`). FE fetch helper `frontend/lib/api.ts`
  uses `credentials:"include"`, base = `NEXT_PUBLIC_API_URL ?? http://localhost:8000`.
- **`GET /api/auth/me`** → `{authenticated, role:"user"|"host", is_admin, id}` — the
  single source for the gate.

### Current routes
- `frontend/app/events/page.tsx` → `<EventsView/>` (member card UI,
  `components/EventsView.tsx`, behind `<AuthGate/>`).
- `frontend/app/host/*` → admin console: `/host` (sign-in), `/host/events`,
  `/host/events/new`, and the superadmin-only `/host/admins` + `/host/members`.
- `frontend/app/signup/page.tsx` → member account creation.

### Relevant API (backend/app/api/routes/)
- `auth.py`: `POST /auth/signup/user` (name → 3-icon key), `/login/user`,
  `/user` (unified login-or-signup), `/login/host`, `/logout`, `GET /auth/me`.
  **There is no `/signup/host`** — superadmins create organizer accounts.
- `users.py`: `GET /users/me`, `PATCH /users/me`, `GET /users`,
  `PATCH /users/{id}`, `DELETE /users/{id}`.
- `hosts.py`: `GET /hosts/me`, plus superadmin-only
  `GET|POST /hosts` and `PATCH|DELETE /hosts/{id}`.
- `events.py`, `attendance.py`.

### Data model (backend/app/models/, backend/alembic/versions/)
- `users`: id, first_name, last_name, username (firstname_lastname, NOT unique),
  password_hash, auth_type, **icons text[] UNIQUE**, created_at, plus
  `accessibility_prefs` / `interest_categories` (text[]) and the three
  accessibility-mode toggles. The interest columns drive the member feed's
  ordering.
- `hosts`: `is_admin = false` is a plain admin (own programs only);
  `is_admin = true` is a superadmin (any program, plus member and admin accounts).
- `events`: category (**picked from `lib/categories.ts`, not free text** — the
  feed matches member interests against it), accessibility_tags text[]
  (e.g. wheelchair_accessible, sensory_friendly, childcare_provided, free),
  host_id, times, cover_image_url, `deleted_at` (archive, never delete), plus
  `requires_signup` × `registration_mode` (internal/external) + `registration_url`
  — the four states the member CTA branches on.

## 4. How personalization actually works

The prefs columns and the wizard described in earlier drafts of this doc are
**done** — no migration to run, no `/get-started` to build.

- `users.accessibility_prefs` and `users.interest_categories` (both `text[]`,
  default `{}`) exist and are returned by `GET /users/me`.
- Members set interests during `/signup` and edit them in the member settings
  menu; both write through `PATCH /users/me`.
- `frontend/lib/feed.ts` does the ordering: `+3` when an interest matches
  `event.category`, `+1` per accessibility pref present in
  `event.accessibility_tags`, ties broken by the server's original index so the
  feed never reshuffles between renders.
- The topic list lives in `frontend/lib/categories.ts` as `CATEGORIES`
  (`Cooking, Food, Hangout, Sports, Games, Arts, Music, Advice`). It is the
  **single** source for the signup chips, the member topic stepper, and the host
  category picker. Adding a second list, or letting hosts type a category by
  hand, silently breaks matching — a program with an off-list category can never
  match anyone.

## 5. Deployment (the one genuinely open thread)

The `vercel.json` `services` schema is settled and the project **builds green** —
production deployments exist for `master`, with the Python backend lambda
bundling correctly. What's broken is configuration, not code:

- **Vercel Authentication (SSO)** is enabled for all deployments except custom
  domains. Every `*.vercel.app` URL 302s to a login wall, so nobody outside the
  Vercel account can open the app. Attach a custom domain, or disable protection
  for production.
- **`DATABASE_URL` points at the wrong pooler.** Runtime logs show
  `FATAL: (ENOTFOUND) tenant/user postgres.<ref> not found` against
  `...pooler.supabase.com:5432`. That's the **session** pooler; serverless needs
  the **:6543 transaction** pooler. This surfaced as a 500 on `POST /auth/user`
  — i.e. signup is dead on the deployed app.

Other required backend env vars: `JWT_SECRET`, `COOKIE_SECURE=true`,
`FRONTEND_ORIGIN`, `ROOT_PATH=/api`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.
Dashboard side: Framework = **Services**, Root Directory = **repo root**.

Once both are fixed, smoke-test `/api/health`, `/api/events`, and a real signup
against the deployed URL — the DB failure above was only visible in runtime
logs, not in the build.

## 6. Landmines (don't relearn the hard way)
- Do NOT reintroduce `passlib`. Use `bcrypt` directly (`app/core/security.py`).
- The 3-icon set is the credential → generate with `secrets`, never `random`.
  Keyspace ~12k combos; add login rate-limiting before calling this production auth.
- `DATABASE_URL`: **:6543 transaction pooler** for serverless/Vercel, **:5432 session
  pooler** for local. Prefix must be `postgresql+psycopg://`.
- RLS is intentionally off; all DB access goes through the FastAPI backend. Never
  expose the anon key or hit Supabase from the browser.
- `backend/.env` is gitignored and holds real secrets — never commit it.
