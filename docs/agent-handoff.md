# Agent Handoff — KW Community Compass

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
  applied (5 tables) + **seeded** (2 hosts `admin@kwhab.org`/`admin123`, 2 events).
- **Local dev wired**: `backend/.env` has the correct pooler `DATABASE_URL`
  (:5432 session pooler). Run: `cd backend && .venv/bin/uvicorn app.main:app --reload`
  and `cd frontend && npm run dev`.
- **Backend hardening**: dropped `passlib` → direct `bcrypt` (passlib crashes on
  bcrypt ≥4.1 — do NOT reintroduce it); icon keys from `secrets` CSPRNG;
  `JWT_SECRET` required (no default); DB engine uses `NullPool` +
  `prepare_threshold=None` for pgbouncer/serverless compatibility;
  `main.py` honors `settings.ROOT_PATH` (`""` local, `/api` prod).

### What's NOT done
- **Deploy not executed**: `vercel login` still pending; the root `vercel.json`
  uses a `services` block that is **not standard Vercel schema** — needs validation
  against real Vercel support (may need a conventional single-root + `api/` layout).
- **Feature "item 1" below is designed but not implemented** (awaiting final nod).

## 2. The current task ("item 1") — role-based root gate + onboarding

**Goal:** `/` should route by auth state:
- signed-in **user** → `/events`
- signed-in **host** → `/events-dashboard`
- **signed out** → `/get-started` (onboarding wizard that sets initial preferences)

**Approved design decisions:**
- **Onboarding wizard with DB-stored prefs** (not a rename-only / not client-only).
- **Move & redirect** old routes: `EventsView` (`/`) → `/events`; `/host*` →
  `/events-dashboard*`; `/signup` → `/get-started`. Old paths 301 via `next.config.mjs`.
- **Client-side gate** at `/` (splash → `GET /api/auth/me` → `router.replace`), for
  dev/prod parity and consistency with existing client-auth. (Middleware+JWT-decode
  is the flash-free alternative but needs `JWT_SECRET` in the frontend.)
- Personalization **sorts, does not filter** — nothing is hidden.

**Open / unconfirmed:** user has not given the final "approve" on the design yet
(the 3 points above: gate mechanism, taxonomy lists, sort-not-filter).

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

### Data model (backend/app/models/, schema.sql)
- `users`: id, first_name, last_name, username (firstname_lastname, NOT unique),
  password_hash, auth_type, **icons text[] UNIQUE**, created_at, plus
  `accessibility_prefs` / `interest_categories` (text[]) and the three
  accessibility-mode toggles. The interest columns drive the member feed's
  ordering.
- `hosts`: `is_admin = false` is a plain admin (own programs only);
  `is_admin = true` is a superadmin (any program, plus member and admin accounts).
- `events`: category (**picked from `lib/categories.ts`, not free text** — the
  feed matches member interests against it), accessibility_tags text[]
  (e.g. wheelchair_accessible, sensory_friendly, childcare_provided, free,
  no_registration), host_id, times, cover_image_url, etc.

## 4. Proposed changes for item 1 (for the implementer)

**DB migration** (Supabase `apply_migration` + SQLAlchemy `User` + `schema.sql`):
```sql
alter table users add column if not exists accessibility_prefs text[] not null default '{}';
alter table users add column if not exists interest_categories text[] not null default '{}';
```
**Backend**: extend `POST /auth/signup/user` body (schemas/auth.py) with optional
`accessibility_prefs`, `interest_categories`; persist on the user. Add both arrays to
`UserOut` (schemas/user.py) so `GET /users/me` returns them.

**Wizard `/get-started`** — 3 steps in the one-thing-at-a-time style:
1. Accessibility needs (chips): `wheelchair_accessible, sensory_friendly,
   childcare_provided, asl_interpretation, plain_language, transit_accessible,
   scent_free, no_registration, free`
2. Interests (chips): `Food, Newcomers, Arts, Sports & Rec, Education, Wellness,
   Music, Social, Outdoors, Technology`
3. Name → generate 3-icon key (reuse existing signup UX).
→ one `POST /auth/signup/user` with name + prefs → cookie set → redirect `/events`.

**Personalization** (`/events`): fetch `/users/me` (now has prefs) + `/events`; sort by
match score (+1 per interest == event.category, +1 per pref ∈ event.accessibility_tags);
highest first, stable ties.

## 5. Spin-off agent ideas (with dependencies)

Split so agents don't collide. **Backend is the unblocker — do it first or in parallel
behind a stubbed contract.**

- **A. Backend accessibility agent** (backend-only, independently testable):
  prefs migration + `signup/user` extension + `UserOut` prefs. *No FE dependency.*
  Deliverable other agents build against: the `/users/me` + signup contract.
- **B. Frontend routing/gate agent**: root client-side gate, route moves
  (`/events`, `/events-dashboard`), `next.config.mjs` redirects. *Independent of A*
  (only touches routing/auth-me, which already exists).
- **C. Onboarding wizard agent**: `/get-started` 3-step UI. *Depends on A's signup
  contract* — can start against the stub, integrate when A lands.
- **D. Feed personalization agent**: sort logic in `EventsView`. *Depends on A*
  (needs prefs in `/users/me`); small, do last.
- **E. Deployment agent**: finish `vercel login`, validate the `vercel.json`
  `services` schema (likely rework to single-root + `api/` function), set the 6 prod
  env vars, deploy, smoke-test `/api/health` + `/api/events`. *Fully independent* of A–D.

**Suggested parallelization:** A + B + E in parallel now; C follows A's contract;
D last. Watch for the one shared file if B and C both touch `next.config.mjs` /
`app/layout.tsx` — coordinate or sequence those edits.

## 6. Landmines (don't relearn the hard way)
- Do NOT reintroduce `passlib`. Use `bcrypt` directly (`app/core/security.py`).
- The 3-icon set is the credential → generate with `secrets`, never `random`.
  Keyspace ~12k combos; add login rate-limiting before calling this production auth.
- `DATABASE_URL`: **:6543 transaction pooler** for serverless/Vercel, **:5432 session
  pooler** for local. Prefix must be `postgresql+psycopg://`.
- RLS is intentionally off; all DB access goes through the FastAPI backend. Never
  expose the anon key or hit Supabase from the browser.
- `backend/.env` is gitignored and holds real secrets — never commit it.
