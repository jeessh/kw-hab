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

| 2026-08-14 | **Event Viewing / Admin Event Management PRD** + decision log of 2026-08-09 | Scope by role (members, admin, NPOs). Two things it settles: **metrics are explicitly out of MVP scope**, and NPOs get an **invitation link + onboarding** rather than only superadmin-created accounts. Confirms: separate website, browse without login, save requires a name + icon account, three 45-minute testing sessions with nine testers. |

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

Status assessed against the code as of **2026-08-20**. IDs are stable — cite
them in PRs and discussion. ✅ built · 🟡 partial · ❌ missing.

> Re-assess before trusting a row. The 2026-08-13 pass went stale within days —
> a dozen rows marked ❌ or 🟡 had shipped and the register still said otherwise,
> which is worse than having no register.

### Platform prerequisites

| ID | Requirement | Status | Where it stands |
| --- | --- | --- | --- |
| P-1 | **Schema changes can reach the live DB** | ✅ | Alembic added; `create_all` on startup removed, `schema.sql` deleted. Baseline revision is idempotent so it is safe against the hand-provisioned Supabase DB with no `stamp` step. |
| P-2 | Attendance data survives event/account changes | ✅ | Events and members archive via `deleted_at`; un-saving flips `event_attendees.status`; the `attendees` relationships dropped `delete-orphan` so a stray `db.delete()` fails loudly instead of erasing history. The DB-level cascade that was the last latent path is closed too — see P-2a. |
| P-2a | FK-level protection for attendance | ✅ | Both `event_attendees` FKs are `ON DELETE RESTRICT` (migration `0015`). A manual `DELETE` against users or events in the SQL editor now fails instead of erasing history, and it covers hosts transitively — `events.host_id` still cascades from `hosts`, so the delete reaches `event_attendees` and is refused there. |
| P-3 | Rate limiting on auth | ✅ | Postgres-backed failure counters on all three sign-in routes (10/15min per identity, 200/15min per IP). Failures only, and success clears the identity key but deliberately not the shared IP key. Account **creation** is still uncapped — see P-3a. |
| P-3a | Cap on account creation | ❌ | `/auth/user` can mint accounts without limit. Any cap low enough to matter risks cutting off a caregiver onboarding a group in one sitting, so it needs a chosen number. |
| P-4 | Feed returns all events | ✅ | The feed pages through `/events?limit&offset` (`app/page.tsx`) until the server stops returning rows, so the 200 cap no longer truncates it. Worth remembering the cap exists when writing any *other* caller — 273 occurrences is already past it. |

### Accounts & auth

| ID | Requirement | Status | Where it stands |
| --- | --- | --- | --- |
| A-1 | Member sign-in without email/password | ✅ | Icon key, now **two** icons (`ICON_COUNT`) picked in turn. Genuinely good for the barrier profile. |
| A-2 | **A wrong icon tap does not destroy the account** | ✅ | Returns `mode: "conflict"`; creating a second account under an existing name now needs an explicit `create_new`. Note the conflict response is a new username-enumeration oracle — mild, and the reason P-3 mattered. |
| A-3 | Member account recovery | ✅ | `POST /users/{id}/reset-key` (superadmin) issues a new key; the console lists every member's current one. Member-side, the sign-in conflict offers "I forgot my icons" instead of dead-ending between "try again" and "I'm new" — the latter strands the account they own. Staff-mediated by necessity: there is no second factor on a member account to prove anything with, and revealing an icon would cut a 132-combination keyspace to 12. |
| A-4 | Account creation without typing | ❌ | `/signup` gates step 1 on two typed name fields (`signup/page.tsx:117`). "Can't type" is a stated barrier. Steps 2-4 are tap-only and fine. |
| A-5 | NPO staff password recovery | ✅ | Email reset — `/auth/host/forgot` → `/auth/host/reset`, single-use, one-hour expiry, token stored as a hash. `forgot` answers identically whether or not the address exists, so it can't enumerate the agencies. Needs the `SMTP_*` env group to actually send; unset means the link is logged, not mailed. |
| A-6 | ~~Multi-user organizations~~ | — | **Out of scope per §3.5** — one shared login per agency. The residual bug is fixed: removing an organizer now archives the account and its programs together, so the programming stays attributed to the agency that ran it instead of moving to whoever pressed Remove. |
| A-7 | NPO approval before posting | ✅ | Settled by §3.2 — fixed superadmin creates organizer accounts, approval happens off-platform, no self-serve signup. Current implementation is correct. Invitations (`/invites`) now let a superadmin hand over account creation without ever knowing the password. `/host` tells an applicant to ask a superadmin and links to password reset, so it is no longer a dead end. Remaining nice-to-have: forced password change on an account created directly rather than by invitation. |
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
| D-6 | Filter by age group / audience | 🟡 | Hosts set `min_age`, `max_age` and `is_youth`. `is_youth` **is** surfaced: `lib/dimensions.ts` buckets programs into a Youth group in the feed's "See events by" picker. `min_age` / `max_age` are collected and never shown, and there is no age *filter* — only a grouping. |
| D-7 | "Who else is going?" / social | ❌ | Attendance is private; no social layer. Stakeholders asked for sharing a calendar with known people, with approval. |
| D-8 | Accessibility-need matching | 🟡 | Wired at both ends and functional. Hosts tick what a program offers ("What does it offer?"); members pick what they need ("What you need" in the settings menu, not signup — see A-4); `matchScore` scores the overlap. `lib/accessibility.ts` is the single vocabulary for both pickers, taken from what the database already held rather than invented, and it grows after the next focus group. **An access match now outranks a topic match** (5 vs 3): a topic is a preference, a step-free venue is not, and the old weighting put a cooking class up a flight of stairs above a step-free session. Still open: **nothing renders the tags to members**, so the feed silently reorders without saying why — that is the remaining half, deliberately deferred. Also unresolved: whether needs should be allowed to *filter* (they only sort today), which cannot be answered until programs carry the tags that require a human to assert them — `free` and `no_registration` are backfilled from the columns that already imply them (231 and 163 live events), but no live program yet claims step-free access or interpretation. |
| D-9 | Standardized event detail format | 🟡 | Schema is standardized; enforcement is not — see N-1. |

### Registration

| ID | Requirement | Status | Where it stands |
| --- | --- | --- | --- |
| R-1 | **`registration_mode` + `registration_url`** | ✅ | Both on `Event`; validation shared by create and update, and update checks the merged row. The link is required only in the external+signup state. |
| R-2 | The four registration states drive distinct member behaviour | ✅ | The carousel and the detail modal both branch on `requires_signup` × `registration_mode` now, matching the event page. |
| R-2a | Member knows they are leaving the platform | ✅ | The destination hostname sits under the button — says "you are leaving" more plainly than a sentence about it, and costs four words. |
| R-3 | Browse without an account; save is the gate | ✅ | `/events` is open; `AuthGate` gone. Saving redirects to sign-in carrying the program, and the save completes on return. Accessibility modes work signed-out (session-only); topics and the saved list need an account. |
| R-4 | Un-save | ✅ | Wired in `EventsView`, and re-pressing save on a saved program un-saves it. |
| R-5 | Saves actually persist | ✅ | A failed save rolls the badge back and announces it, instead of claiming a program is saved that the server never recorded. |
| R-6 | Capacity limits | ✅ | `events.capacity`, set in the host form ("Spaces — leave blank for no limit"), enforced in `attend_event` behind a row lock so two people racing for the last place can't both get it. Higher-needs allocation specifically is still not modelled. |
| R-7 | Reminder before the event | ❌ | Members have **no email/phone field at all**. Decided 2026-08-13: contact details are **optional and added after signup**, never required — icon sign-in stays contact-free. Schema is cheap; the mail sender and scheduler are the real cost and can land later. |
| R-8 | Add to Google Calendar / .ics | ❌ | Nothing. |

### NPO console

| ID | Requirement | Status | Where it stands |
| --- | --- | --- | --- |
| N-1 | **Mandatory, standardized fields with example text** | ✅ | Name, date, time, location, description, image and activity type are all required and marked; the form says what is still missing rather than failing silently. Description — the known-bad field — is required and up front, with a worked example as placeholder text. |
| N-2 | Edit offers the same fields as create | ✅ | `EditEventModal` is now a thin wrapper around the shared `EventForm` rather than a second implementation, so the two cannot drift apart again, and the free-text category input went with the rewrite. |
| N-3 | Can't edit another org's events | ✅ | Enforced in API (403) and UI ("View only"). |
| N-4 | Superadmin can manage any event + accounts | ✅ | With self-demotion/self-deletion guards intact. |
| N-5 | Deletion restricted to superadmins | 🟡 | Half true, and the other half is deliberate. Archiving rather than destroying is done, and `series` means removing a repeating program doesn't leave fifteen dates behind. But `delete_event` depends on `get_current_host`, not `require_admin`: an owner may retire their own program **while nobody has saved it**, and is refused once somebody has. That matches §3.8's working resolution — NPOs need to fix their own mistakes — so the requirement as worded is what's out of date, not the code. Worth re-wording the requirement rather than restricting the route. |
| N-6 | Success confirmation after publish/edit/delete | ✅ | Publishing confirms and hands over a share link, deleting confirms and offers Undo, and editing confirms by name. `UndoToast` only draws the Undo button when there is something to undo — the copy-link confirmation used to offer one that did nothing. |
| N-7 | Copy shareable link on create | ✅ | Copy link on every row plus on the publish confirmation; browser-read origin, prompt fallback. |
| N-8 | Reschedule notifies affected members | ❌ | No notification of any kind. |

### Metrics & reach

| ID | Requirement | Status | Where it stands |
| --- | --- | --- | --- |
| M-1 | ~~Per-event save/signup counts visible to the NPO~~ | — | **Out of MVP scope** per the 2026-08-14 PRD ("Metrics not in MVP scope"). The data is being collected — saves, click-throughs, postings — so this is a reporting surface whenever it comes back, not a rebuild. Original note: | No count on `EventOut`, no host-scoped endpoint, no column in the console. `event_attendees` is current state, not a log, and has no `event_id`-leading index. |
| M-2 | Registration click-through tracking | ✅ | Append-only `event_registration_clicks`; `POST /events/{id}/registration-click` is public (anonymous clicks count, `user_id` nullable) and IP-bounded. Recorded before navigating out, and a failure to record never costs the member the link. |
| M-3 | Admin analytics dashboard | ❌ | No route, no endpoint, no charting dep. |
| M-4 | Event postings trend | ❌ | `created_at` exists; nothing aggregates it. |
| M-5 | **Per-event public URL** | ✅ | `/events/[id]`, server-rendered and public. |
| M-6 | SEO / metadata / OG cards | 🟡 | Per-event title/description/canonical, OG + Twitter cards with the cover image, JSON-LD `Event`, `metadataBase`, sitemap, robots, and a favicon (`app/icon.svg`). Still missing: an OG image for pages with no cover. |
| M-7 | Indexable event content | 🟡 | Event pages are in the HTML and in the sitemap, and `/events` is now reachable signed-out. The carousel itself is still client-rendered, so its content isn't in the server HTML — fine while the per-event pages carry indexing. |

### Accessibility

| ID | Requirement | Status | Where it stands |
| --- | --- | --- | --- |
| X-1 | Many input paths to one action | ✅ | Six routes to save (drag, 2s hold, 1s ArrowDown, button, voice, head-dwell), all through shared handlers. The strongest thing in the build. |
| X-2 | Text-to-speech / voice commands / head tracking | ✅ | All real. TTS↔mic duplex handling is a good detail. |
| X-3 | ~~Text-size toggle~~ | — | **Out of scope per §3.4** — browser/OS zoom already does this. The source-of-truth doc claims it as built; it never existed. Remove the claim rather than build it. |
| X-4 | Keyboard navigation | ✅ | The window-level handler checks `e.target` before acting, so typing in a field or operating a select no longer triggers the feed's shortcuts. |
| X-5 | Screen-reader support | 🟡 | Card changes announce (X-8); the a11y menu dropped the bogus `role="menu"` for `role="dialog"`, closes on Escape and returns focus to its trigger; the sign-in overlay closes on Escape too, and the panels that launch it close on the way out rather than lingering behind it. Still open: the page `<h1>` changes per card. Modals and the Saved panel have correct traps. |
| X-6 | ~~Contrast / colour controls~~ | — | **Out of scope as a feature per §3.4.** Noted for the UI pass only: 7 of 8 category banners fail 4.5:1 with white text, and `pop #FF7A4D` (every error message) is 2.58:1. A palette fix when the design is touched, not a toggle to build. |
| X-7 | Honour the OS reduced-motion signal | 🟡 | In scope — the animations are JS-driven, so the native `prefers-reduced-motion` signal doesn't reach them on its own. Wired in the main paths, and the calibration halo (the one unending animation, on the screen you must hold still for) now holds a steady glow instead of pulsing to 2.6×. Still no `MotionConfig` at the root, so each new animation has to remember on its own. |
| X-8 | Announce card changes | ✅ | A polite live region announces each card as it becomes current — title, date, location, and "n of m" — plus save/un-save outcomes and topic changes. |

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
