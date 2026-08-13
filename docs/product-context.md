# Product Context — KW Hab Community Calendar

**Purpose of this file.** Everything the product side has told us, distilled once
so it never has to be re-pasted. If a doc listed in §1 shows up again in a
conversation, it is already folded in here — skip it and work from this file.
New material gets appended to §1 with a date, and any requirement it changes gets
updated in §4.

Engineering conventions live in root `CLAUDE.md`; implementation handoff notes
live in `docs/agent-handoff.md`. This file is the **product/requirements** layer.

---

## 1. Sources ingested

| Date ingested | Source | What it contributed |
| --- | --- | --- |
| 2026-08-13 | **Flowchart spec** — "Event Platform — User & Admin Flow Spec" (Section 1 Auth + Event Management, Section 2 Admin Event Management), Mermaid + decision log + gaps list | The intended member flow (anonymous carousel → save vs. register branch), the admin flow (login → tiered list → edit own / create → copy share link), and two decisions: login mandatory iff registration required; track registration-link clicks and saves. |
| 2026-08-13 | **NPO scoping call notes, 2026-08-04** (Teams) | User barriers (literacy, processing, articulation/movement, memory); current tooling; honour-system admin trust; "advertising / directory driving traffic to NPO sites"; what's broken in the current calendar; caregiver behaviour; AI feedback concept; demo feedback (category tags, free/paid separation, searchable by category); registration "later, if adoption"; testing plan. |
| 2026-08-13 | **"KW Hab Community Calendar — Source of Truth"** (consolidated reference, last updated 2026-08-04) | Context on the live calendar, the problem statement, the four user groups, disability/device detail, event structure, the four solution requirements, §5 what's built / what's next / decisions / what wasn't solved / accessibility addressed-vs-untested. |
| 2026-08-13 | **Business goals & success metrics notes** (bulleted, post-call) | Adoption = signups + postings; grant-reporting value of data; member and NPO journeys; NPO approval/onboarding; admin scope; analytics dashboard; success definitions; next steps and owners. |

> Anything below is derived from the above. Where sources conflict, §3 records the
> conflict rather than silently picking a side.

---

## 2. Who this is for

Twelve ministry-funded agencies collaborate under KW Hab; **seven currently post
to the shared calendar**. The live tool is `kwhab.ca/join-us/calendar-of-events/`
— a day/month grid, colour-coded by organization, tagged free/paid/youth, where
clicking an event reveals image, description, PDF attachments, and a
**registration link into that agency's own system**.

| Group | Needs |
| --- | --- |
| **Event goers** — community members with intellectual disabilities | See events quickly, find details easily, **choose for themselves**. Dignity/autonomy is an explicit stakeholder priority, not a nice-to-have. |
| **Parents / caregivers** | Support, sometimes 24/7. Today they often *do the process for* the member rather than *with* them — which is precisely the loss of choice the project exists to fix. Support should fade out as confidence grows. |
| **Event hosts (NPO staff)** | Post events fast. Often no technical skill, no spare time, exhausted. Bad descriptions are a known problem. |
| **Admin (KW Hab)** | Aggregate everyone's events; approve and manage NPO accounts; own the data. |

**Barrier profile — there is no single "accessible user".** Low literacy;
processing (limit how much must be processed at once); articulation/movement
(navigation must be simple); **memory** (passwords, tracking events); sensory
issues with light and sound; limited mobility; dexterity — difficulty with mouse
and keyboard; **"can't type" is called out specifically**; verbal/nonverbal
range. Devices vary widely; some members use pictogram/touch screens to
communicate with staff.

---

## 3. Decisions and open conflicts

**3.1 Registration model — DECIDED 2026-08-13.**

Two independent axes on every event, giving four states and three member
behaviours:

| `registration_mode` | `requires_signup` | Member action |
| --- | --- | --- |
| `internal` | false | **Save.** Drop-in; nothing to register for. |
| `internal` | true | **Register in-platform.** Creates the attendance record; this is the gate. |
| `external` | false | **Save.** Same flow as internal drop-in — the outbound link is informational. |
| `external` | true | **Go to the organizer's site.** Redirect, and the member must be aware they are leaving. Click is tracked. |

Saving stays available in every state; registration is the *additional* action
when required. `registration_url` is required when `registration_mode` is
`external`, and unused otherwise.

This supersedes §5.3.3 of the source-of-truth doc ("in-platform registration
replaces external links") — external is a first-class mode, not a fallback,
because the live calendar's content cannot migrate without it.

**3.2 Admin/organizer registration — DECIDED 2026-08-13.** Internal only. The
superadmin account is fixed; superadmins create the real organizer accounts.
No self-serve host signup, ever. Confirms the current implementation.

**3.3 Copy — DECIDED 2026-08-13.** On the member surface, **the only substantial
text is the event's own content.** Interface copy is minimal — labels, not
explanations. The admin console may carry more text, but it stays simple. This
constrains the "ensure they are aware" requirement in 3.1: the leaving-the-site
signal has to be carried visually and in a few words, not a paragraph.

**3.4 Accessibility scope — DECIDED 2026-08-13.** Build only what is **exclusive
to this platform's functionality**. Anything the browser or OS already provides
is out of scope: text size, contrast, colour, zoom, high-contrast mode. In scope
is everything broken *because* the interaction model is custom — keyboard
handling in the carousel, announcing card changes, the accessibility menu's
semantics, and honouring the OS reduced-motion signal in the JS animation paths.

**3.5 One login per organization — DECIDED 2026-08-13.** An organizer account is
a single shared login for the agency. No `organizations` table, no per-staff
accounts. `Host` stays as credential + org identity + authorization principal.
Accepted trade-offs: no audit trail of who posted what, a shared password that
can't be revoked per person, and no way to off-board one staff member. Revisit
only if an agency asks.

**3.6 Categories are admin-managed — DECIDED 2026-08-13.** The taxonomy moves out
of `lib/categories.ts` into the database with full CRUD. Deleting a category that
has events raises a conflict the admin resolves in a modal: reassign the affected
events to another category, or cancel. Seed list is our best judgement for now.

> **Engineering consequence.** Today a category is a *label string* stored on
> `events.category` and on `users.interest_categories`, and matching is
> string equality (`lib/feed.ts`). Once labels are editable, a rename silently
> breaks every match and a delete orphans members' saved interests. Categories
> therefore need a **stable slug or id** stored on both events and user
> interests, with the label as display-only — and that means migrating the
> existing label-valued rows. This is the real cost of the decision, not the CRUD
> screens.

**3.7 Events are publicly browsable — DECIDED 2026-08-13.** `/events` and the
per-event page are open to everyone. Auth gates only the actions that need an
account: saving, and internal registration. Leaving for an organizer's site is
never gated. A save attempted while signed out must **preserve the intent** —
sign in, then complete the save on the event they were looking at.

**3.8 Deletion — DECIDED 2026-08-13.** Archive, never destroy. Applies to events
and member accounts; attendance rows survive both.
- *Flowchart*: deletion is the elevated, superadmin-only capability.
- *Business notes*: "Admins can create, edit, delete, and reschedule any event"
  (about the KW Hab super user) and "Nonprofits should not be able to edit other
  nonprofits' events" — silent on whether an NPO may delete its own.
- **Working resolution:** NPOs may retire their own events (they need to fix
  mistakes), but as an **archive, not a hard delete**, because attendance numbers
  are grant-reporting evidence and must survive.

**3.6 Hosting.** *(open)* The 08-04 call says "everything self-hosted"; the
current build is Vercel + Supabase. Flag before any infrastructure commitment.

---

## 4. Requirement register

Status assessed against the code as of 2026-08-13. IDs are stable — cite them in
PRs and discussion. ✅ built · 🟡 partial · ❌ missing.

### Platform prerequisites

| ID | Requirement | Status | Where it stands |
| --- | --- | --- | --- |
| P-1 | **Schema changes can reach the live DB** | ❌ | No Alembic. `create_all()` runs only when `ROOT_PATH` is empty (`app/main.py:27`) and never ALTERs. `backend/schema.sql` is hand-run in the Supabase editor. Every requirement below needs a hand-written `ALTER`, deployed in lockstep, no rollback. **Blocks everything else.** |
| P-2 | Attendance data survives event/account changes | ❌ | `delete_event` hard-deletes; `Event.attendees` cascades `delete-orphan` (`models/event.py:59`) and the FK is `ON DELETE CASCADE`. Unattend also hard-deletes (`attendance.py:49`). Any admin can destroy their own program's grant evidence in one click. |
| P-3 | Rate limiting on auth | ❌ | None anywhere. Icon keyspace is ~59k combos and the credential is name+icons — exhaustible unauthenticated. |
| P-4 | Feed returns all events | 🟡 | `/events` defaults to 100, caps at 200 (`events.py:86`); the member feed requests no params (`app/events/page.tsx:16`) and sorts client-side, so past row 100 the "personalization never filters" invariant is silently false. |

### Accounts & auth

| ID | Requirement | Status | Where it stands |
| --- | --- | --- | --- |
| A-1 | Member sign-in without email/password | ✅ | 3-icon key. Genuinely good for the barrier profile. |
| A-2 | **A wrong icon tap does not destroy the account** | ❌ | `POST /auth/user` creates a new account on no-match (`auth.py:143-164`); UI says "You're in!" and saved events vanish. Worst failure mode for a memory-barrier population. |
| A-3 | Member account recovery | ❌ | No reset, hint, or lookup path in FE or BE. |
| A-4 | Account creation without typing | ❌ | `/signup` gates step 1 on two typed name fields (`signup/page.tsx:117`). "Can't type" is a stated barrier. Steps 2-4 are tap-only and fine. |
| A-5 | NPO staff password recovery | ❌ | Only path is a superadmin `PATCH /hosts/{id}`. A locked-out sole superadmin is unrecoverable without DB access. |
| A-6 | ~~Multi-user organizations~~ | — | **Out of scope per §3.5** — one shared login per agency. One residual bug still worth fixing: removing an organizer reassigns their programs to the acting superadmin (`hosts.py:156`), i.e. one agency's programming lands with another agency. Should archive with the account instead. |
| A-7 | NPO approval before posting | ✅ | Settled by §3.2 — fixed superadmin creates organizer accounts, approval happens off-platform, no self-serve signup. Current implementation is correct. Remaining nice-to-haves only: forced password change on first login, and a contact path for an applicant who lands on `/host` (today it's a dead end). |
| A-8 | Caregiver-linked accounts (support, not proxy) | ❌ | No user-to-user relation of any kind. |

### Discovery

| ID | Requirement | Status | Where it stands |
| --- | --- | --- | --- |
| D-1 | Filter by interest/category | 🟡 | Interest **sorts**, never filters (`lib/feed.ts`) — a deliberate decision, unchanged. |
| D-1a | **Admin-managed category CRUD** | ❌ | Per §3.6. New `categories` table + endpoints; `lib/categories.ts` becomes a fetch, not a constant, in the four places that import it. Delete needs an affected-event count and a bulk reassign. |
| D-1b | **Slug-stable category identity** | ❌ | Prerequisite for D-1a — see the note under §3.6. Events and `users.interest_categories` both store labels today; both need migrating to slugs or matching breaks on the first rename. |
| D-2 | Filter by cost | ✅ | Free/paid/all (`EventsView.tsx:1160`). |
| D-3 | Filter by organization | ✅ | Present — but this is the one axis the old calendar already had and that stakeholders called insufficient. |
| D-4 | Filter by proximity / location | ❌ | `location` is one free-text string. No coordinates, no radius, no map. Stakeholders liked a map-oriented competitor. |
| D-5 | Filter by time / date range | ❌ | No date filter in the member UI. |
| D-6 | Filter by age group / audience | ❌ | No field. The live calendar already tags `youth`. |
| D-7 | "Who else is going?" / social | ❌ | Attendance is private; no social layer. Stakeholders asked for sharing a calendar with known people, with approval. |
| D-8 | Accessibility-need matching | ❌ | Hosts tick 6 accessibility chips, but nothing in the member UI renders `accessibility_tags`, and signup never collects `accessibility_prefs` — so `matchScore`'s access loop always iterates an empty array. Write-only data. |
| D-9 | Standardized event detail format | 🟡 | Schema is standardized; enforcement is not — see N-1. |

### Registration

| ID | Requirement | Status | Where it stands |
| --- | --- | --- | --- |
| R-1 | **`registration_mode` + `registration_url`** | ❌ | No mode and no URL field on `Event`. Per §3.1 the mode is `internal`/`external`, and `registration_url` is required when external. Content migration from the live calendar is impossible without it. |
| R-2 | The four registration states drive distinct member behaviour | ❌ | `requires_signup` is set by hosts and read by **nothing** in the member UI — save and register are the same action. Per §3.1: save (×2 states), register in-platform, or leave for the organizer's site. |
| R-2a | Member knows they are leaving the platform | ❌ | Nothing exists. Must be carried visually + a few words per §3.3, not a paragraph. |
| R-3 | Browse without an account; save is the gate | ❌ | Per §3.7. `/events` and the per-event page go public; the save action triggers sign-in and then **completes the save the member intended** — no plumbing for that exists (`/signup` hard-codes `router.replace("/events")`). |
| R-4 | Un-save | ❌ | `DELETE /events/{id}/attend` exists; no UI calls it. |
| R-5 | Saves actually persist | 🟡 | `attend()` swallows every error (`EventsView.tsx:283`) — member sees "Saved ✓", server may have nothing. |
| R-6 | Capacity limits (incl. higher-needs allocation) | ❌ | No field; `attend_event` does no count check. |
| R-7 | Reminder before the event | ❌ | Members have **no email/phone field at all**. Decided 2026-08-13: contact details are **optional and added after signup**, never required — icon sign-in stays contact-free. Schema is cheap; the mail sender and scheduler are the real cost and can land later. |
| R-8 | Add to Google Calendar / .ics | ❌ | Nothing. |

### NPO console

| ID | Requirement | Status | Where it stands |
| --- | --- | --- | --- |
| N-1 | **Mandatory, standardized fields with example text** | ❌ | Create requires title + category only and says so: "Two things are required. Everything else is optional." Server requires only `title`. Description — the known-bad field — is optional and hidden in a collapsed accordion. |
| N-2 | Edit offers the same fields as create | ❌ | Edit drops gallery and accessibility tags entirely (create-only, permanently unchangeable) and uses a **free-text category input** (`EditEventModal.tsx:92`) whose placeholder suggests off-taxonomy values — the exact thing CLAUDE.md forbids. Clearing it writes `null`. `ends_at` is unreachable from any form. |
| N-3 | Can't edit another org's events | ✅ | Enforced in API (403) and UI ("View only"). |
| N-4 | Superadmin can manage any event + accounts | ✅ | With self-demotion/self-deletion guards intact. |
| N-5 | Deletion restricted to superadmins | ❌ | Any owner can delete. See §3.2 — recommend archive instead. |
| N-6 | Success confirmation after publish/edit/delete | ❌ | `router.push` back to the table, no toast, no highlight. The Admins page does this correctly; Programs never got it. |
| N-7 | Copy shareable link on create | ❌ | No clipboard code, and no per-event URL to copy. |
| N-8 | Reschedule notifies affected members | ❌ | No notification of any kind. |

### Metrics & reach

| ID | Requirement | Status | Where it stands |
| --- | --- | --- | --- |
| M-1 | **Per-event save/signup counts visible to the NPO** | ❌ | No count on `EventOut`, no host-scoped endpoint, no column in the console. `event_attendees` is current state, not a log, and has no `event_id`-leading index. |
| M-2 | Registration click-through tracking | ❌ | Requires R-1 first, then an append-only click table. |
| M-3 | Admin analytics dashboard | ❌ | No route, no endpoint, no charting dep. |
| M-4 | Event postings trend | ❌ | `created_at` exists; nothing aggregates it. |
| M-5 | **Per-event public URL** | ❌ | No `/events/[id]`. The current card index is in-memory state, never in the URL. |
| M-6 | SEO / metadata / OG cards | ❌ | One global title+description (`layout.tsx:11`). No OG, no sitemap, no robots, no JSON-LD, no favicon. Every shared link renders an identical grey card. |
| M-7 | Indexable event content | ❌ | All 7 routes are `"use client"`; event data is fetched after a cookie check no crawler holds. Total indexable footprint ≈ two sentences of landing copy. (`GET /events` and `/events/{id}` are already public — this is a frontend-only gap.) |

### Accessibility

| ID | Requirement | Status | Where it stands |
| --- | --- | --- | --- |
| X-1 | Many input paths to one action | ✅ | Six routes to save (drag, 2s hold, 1s ArrowDown, button, voice, head-dwell), all through shared handlers. The strongest thing in the build. |
| X-2 | Text-to-speech / voice commands / head tracking | ✅ | All real. TTS↔mic duplex handling is a good detail. |
| X-3 | ~~Text-size toggle~~ | — | **Out of scope per §3.4** — browser/OS zoom already does this. The source-of-truth doc claims it as built; it never existed. Remove the claim rather than build it. |
| X-4 | Keyboard navigation | 🟡 | Window-level handler doesn't check `e.target` (`EventsView.tsx:670`): ArrowDown on the org `<select>` is swallowed *and* starts a save-hold; ArrowDown dismisses the Saved panel instead of scrolling it. |
| X-5 | Screen-reader support | 🟡 | Card changes announce nothing; a11y menu is `role="menu"` with invalid children and no focus trap/Escape; page `<h1>` changes per card. Modals and the Saved panel do have correct traps. |
| X-6 | ~~Contrast / colour controls~~ | — | **Out of scope as a feature per §3.4.** Noted for the UI pass only: 7 of 8 category banners fail 4.5:1 with white text, and `pop #FF7A4D` (every error message) is 2.58:1. A palette fix when the design is touched, not a toggle to build. |
| X-7 | Honour the OS reduced-motion signal | 🟡 | In scope — the animations are JS-driven, so the native `prefers-reduced-motion` signal doesn't reach them. Wired in the main paths but no `MotionConfig`; the calibration halo pulses infinitely at 2.6× scale. |
| X-8 | Announce card changes | ❌ | Arrowing through the whole feed is silent — the custom carousel has no live region. Platform-exclusive: no native affordance covers it. |

---

## 5. Fixed calendar

- **2026-08-13, 1–7pm** — early-stage concept testing. Groups: people supported,
  family/stakeholders, admin/personnel. Standard 5 participants per group, 2-hour
  blocks.
- **~2026-08-13/14** — target for solution definition; PRDs and wireframes follow.
- **Next session agenda (already agreed):** system flows, NPO approval process,
  login/account structure, multi-user orgs, password recovery.

## 6. Owners / actions outside the codebase

- Draft marketing + onboarding plan for volunteers and caregivers — Justin.
- Email KW Hab to request a homepage link to the calendar post-launch — Justin.
  (Users search for "KW Hab", not for the calendar; this is the top of the funnel.)
