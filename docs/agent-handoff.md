# Agent Handoff — The Belonging Collective

Self-contained briefing for spinning up additional agents. Read this + root
`CLAUDE.md` and you have full context without replaying the conversation.

## 1. Project snapshot

Accessible, needs-first community-programming platform for KW nonprofits
(hackathon build). Members discover/attend programs via a tactile,
one-card-at-a-time UI; sign-in is a memorable **2-icon key that IS the
password** (`ICON_COUNT`; it has been 1 and 3 before, so read it).

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
- The **AI feedback interview** tab (conversational feedback capture) is designed
  but deliberately descoped — see §2.
- The open functional gaps are tracked as a status register in
  `docs/product-context.md` §4 — work from that rather than from this file,
  which only carries setup and architecture.

**Deployment is done.** <https://the-belonging-collective.vercel.app> is live and
public; see §5.

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
- Tokens carry **`cv`**, a fingerprint of the password hash they were issued
  against, re-checked on every request. Changing a credential ends the sessions
  opened with the old one. Every token-minting call must pass `cred_hash`, and
  `/auth/me` applies the same check — a gate that disagrees with the API shows a
  signed-in app in which nothing works.

### Current routes
- `frontend/app/page.tsx` → `<EventsView/>` (member card UI,
  `components/EventsView.tsx`). The feed is the **home page**, open signed-out;
  `AuthGate` is gone and there is no `/events` index (it 307s to `/`).
- `frontend/app/events/[id]/page.tsx` → the public, server-rendered program page.
- `frontend/app/host/*` → admin console: `/host` (sign-in), `/host/forgot` +
  `/host/reset/[token]` (password reset), `/host/invite/[token]`,
  `/host/events`, `/host/events/new`, and the superadmin-only `/host/admins` +
  `/host/users` (`/host/members` redirects to it).
- `frontend/app/signup/page.tsx` → member account creation.

### Relevant API (backend/app/api/routes/)
- `auth.py`: `POST /auth/signup/user` (name → icon key), `/login/user`,
  `/user` (unified login-or-signup, returns `mode`), `/login/host`, `/logout`,
  `GET /auth/me`, plus organizer password reset — `/auth/host/forgot`,
  `GET /auth/host/reset/{token}`, `POST /auth/host/reset`.
  **There is no `/signup/host`** — superadmins create organizer accounts.
- `users.py`: `GET /users/me`, `PATCH /users/me`, `GET /users`,
  `PATCH /users/{id}`, `DELETE /users/{id}`, and superadmin-only
  `POST /users/{id}/reset-key` (issue a member a new icon key — the whole of
  member account recovery).
- `hosts.py`: `GET /hosts/me`, plus superadmin-only
  `GET|POST /hosts` and `PATCH|DELETE /hosts/{id}`. `DELETE` archives the
  account **and** its programs.
- `invites.py`, `events.py`, `attendance.py`.

### Data model (backend/app/models/, backend/alembic/versions/)
- `users`: id, first_name, last_name, username (firstname_lastname, NOT unique),
  password_hash, auth_type, **icons text[]** — unique only in combination with
  `username` (`uq_users_username_icons`), not on its own — `deleted_at`,
  created_at, plus
  `accessibility_prefs` / `interest_categories` (text[]) and the three
  accessibility-mode toggles. The interest columns drive the member feed's
  ordering.
- `hosts`: `is_admin = false` is a plain admin (own programs only);
  `is_admin = true` is a superadmin (any program, plus member and admin
  accounts). `deleted_at` archives; `email` is unique over live rows only.
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
- **The accessibility half of that is currently dead code.** Nothing collects
  `accessibility_prefs` — signup asks for interests only — and the host form
  emits just `free`, so the loop scores an empty array against a nearly empty
  one. Tracked as D-8 in `docs/product-context.md`; either wire both ends or
  drop the loop, but don't read the code as evidence the feature works.
- The topic list lives in `frontend/lib/categories.ts` as `CATEGORIES`
  (`Education, Social, Recreation, Support Group, Cooking, Fundraising, Youth
  Programs, Wellness, Fitness, Arts & Crafts, Music, Games, Sports`). It comes
  from the real agency data — the earlier hackathon guess (`Cooking, Food,
  Hangout, Sports, Games, Arts, Music, Advice`) could file only 6 of 37 real
  events, and survives only as `LEGACY_STYLES` so old rows keep a stable colour.
  It is the **single** source for the signup chips, the member topic stepper,
  and the host category picker. Adding a second list, or letting hosts type a category by
  hand, silently breaks matching — a program with an off-list category can never
  match anyone.

## 5. Deployment — live

<https://the-belonging-collective.vercel.app> is public and serving real data.
Both blockers this section used to list were **dashboard settings**, so nothing
in the repo records the fix — verify against the deployment, not the code:

- SSO protection is now scoped to **preview** deployments only, so production is
  reachable without a Vercel login. Preview URLs still 302 to the login wall;
  that is deliberate, so don't share one with the agencies.
- `DATABASE_URL` uses the **:6543 transaction** pooler. The earlier
  `FATAL: (ENOTFOUND) tenant/user postgres.<ref> not found` was the :5432
  **session** pooler, which serverless can't use — and it was visible only in
  runtime logs, never in the build.

Required backend env: `JWT_SECRET`, `COOKIE_SECURE=true`, `FRONTEND_ORIGIN`,
`ROOT_PATH=/api`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, plus the `SMTP_*` /
`MAIL_FROM` group if organizer password-reset mail should actually send.
Dashboard side: Framework = **Services**, Root Directory = **repo root**.

`curl https://the-belonging-collective.vercel.app/api/health` before assuming
any of this has regressed — a stale "it only runs locally" belief here has
already cost one wrong diagnosis.

## 6. Landmines (don't relearn the hard way)
- Do NOT reintroduce `passlib`. Use `bcrypt` directly (`app/core/security.py`).
- The icon set is the credential → generate with `secrets`, never `random`.
  Two ordered icons from twelve is 132 combinations per name, so the
  Postgres-backed limiter in `app/core/rate_limit.py` is load-bearing.
- Allocation of icons is scoped **per username**, matching the real constraint.
  Don't "fix" it back to a global search — that exhausts at 132 members.
- Anything minting a token must pass `cred_hash`, or that account is signed out
  on its very next request.
- `DATABASE_URL`: **:6543 transaction pooler** for serverless/Vercel, **:5432 session
  pooler** for local. Prefix must be `postgresql+psycopg://`.
- RLS is intentionally off; all DB access goes through the FastAPI backend. Never
  expose the anon key or hit Supabase from the browser.
- `backend/.env` is gitignored and holds real secrets — never commit it.
