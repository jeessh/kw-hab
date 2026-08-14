"use client";

import { memo, useMemo } from "react";
import type { Event } from "@/lib/api";
import { CYAN, SKY_DEEP } from "@/components/member/FeedParts";

const TAG = "#F5C449"; // organization pill on the card image

/* ---------------- day grouping ---------------- */

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * "Today | Wednesday, August 12" — the relative word first, because it answers
 * "can I go?" faster than a date does, with the date after it for anyone
 * planning rather than deciding.
 */
function dayHeading(ms: number, todayMs: number): string {
  const dayMs = 86_400_000;
  const diff = Math.round((ms - todayMs) / dayMs);
  const full = new Date(ms).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  if (diff === 0) return `Today | ${full}`;
  if (diff === 1) return `Tomorrow | ${full}`;
  return full;
}

type Day = { key: number; heading: string; events: Event[] };

function groupByDay(events: Event[]): { days: Day[]; undated: Event[] } {
  const todayMs = startOfDay(new Date());
  const byDay = new Map<number, Event[]>();
  const undated: Event[] = [];
  for (const ev of events) {
    if (!ev.starts_at) {
      undated.push(ev);
      continue;
    }
    const key = startOfDay(new Date(ev.starts_at));
    const list = byDay.get(key);
    if (list) list.push(ev);
    else byDay.set(key, [ev]);
  }
  const days = [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, evs]) => ({
      key,
      heading: dayHeading(key, todayMs),
      events: evs,
    }));
  return { days, undated };
}

/* ---------------- card ---------------- */

export const GridCard = memo(function GridCard({
  event,
  saved,
  onOpen,
  onToggleSave,
}: {
  event: Event;
  saved: boolean;
  onOpen: (event: Event) => void;
  onToggleSave: (event: Event) => void;
}) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-[#C9C7D2] bg-white">
      <button
        onClick={() => onOpen(event)}
        className="block w-full text-left"
        aria-label={`Open ${event.title}`}
      >
        <div className="relative h-[152px] w-full bg-edge">
          {event.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.cover_image_url}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
          {event.host_name && (
            <span
              className="absolute bottom-3 left-3 rounded-md px-2.5 py-1 text-sm font-medium text-ink"
              style={{ background: TAG }}
            >
              {event.host_name}
            </span>
          )}
        </div>

        <div className="p-3.5 pr-12">
          <h3 className="font-display text-base font-semibold leading-snug text-ink">
            {event.title}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {event.starts_at && (
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon />
                {new Date(event.starts_at).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            )}
            {event.location && (
              <span className="inline-flex items-center gap-1.5">
                <PinIcon />
                {event.location}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Saving is a property of the card, so it lives on the card — and it's
          the only place in the app that can un-save. */}
      <button
        onClick={() => onToggleSave(event)}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${event.title}` : `Save ${event.title}`}
        className="absolute bottom-[62px] right-3 grid h-9 w-9 place-items-center rounded-lg transition-transform hover:scale-110"
      >
        <BookmarkIcon filled={saved} />
      </button>
    </article>
  );
});

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="22"
      height="26"
      viewBox="0 0 24 24"
      fill={filled ? SKY_DEEP : "none"}
      stroke={filled ? SKY_DEEP : "#1B1830"}
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-5-7 5V4a1 1 0 0 1 1-1z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="shrink-0"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="shrink-0"
      aria-hidden
    >
      <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

/* ---------------- the grid ---------------- */

export const GridFeed = memo(function GridFeed({
  events,
  saved,
  query,
  onOpen,
  onToggleSave,
}: {
  events: Event[];
  saved: Set<string>;
  query: string;
  onOpen: (event: Event) => void;
  onToggleSave: (event: Event) => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((ev) =>
      [ev.title, ev.location, ev.host_name, ev.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [events, query]);

  const { days, undated } = useMemo(() => groupByDay(filtered), [filtered]);

  if (filtered.length === 0) {
    return (
      <p className="mt-16 text-center font-display text-2xl text-muted">
        Nothing matches that.
      </p>
    );
  }

  return (
    <div className="w-full max-w-6xl flex-1 overflow-y-auto pb-10">
      {days.map((day) => (
        <section key={day.key} className="mb-10">
          <h2 className="mb-4 font-display text-2xl text-ink">
            <span className="font-bold">{day.heading.split(" | ")[0]}</span>
            {day.heading.includes(" | ") && (
              <span className="text-muted">
                {" | "}
                {day.heading.split(" | ")[1]}
              </span>
            )}
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {day.events.map((ev) => (
              <GridCard
                key={ev.id}
                event={ev}
                saved={saved.has(ev.id)}
                onOpen={onOpen}
                onToggleSave={onToggleSave}
              />
            ))}
          </div>
        </section>
      ))}

      {undated.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 font-display text-2xl font-bold text-ink">
            Date to be announced
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {undated.map((ev) => (
              <GridCard
                key={ev.id}
                event={ev}
                saved={saved.has(ev.id)}
                onOpen={onOpen}
                onToggleSave={onToggleSave}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
});

/* ---------------- search ---------------- */

export const SearchBox = memo(function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="relative block w-full max-w-[420px]">
      <span className="sr-only">Search for event</span>
      <span
        aria-hidden
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle
            cx="11"
            cy="11"
            r="7"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M20 20l-3.5-3.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search for Event"
        className="w-full rounded-xl border border-[#C9C7D2] bg-white py-3 pl-12 pr-4 text-lg text-ink outline-none focus:border-accent"
      />
    </label>
  );
});

/* ---------------- saved-events button ---------------- */

export const SavedEventsButton = memo(function SavedEventsButton({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative inline-flex items-center gap-2.5 rounded-xl border border-[#C9C7D2] bg-white px-5 py-3 font-display text-lg text-ink transition-transform hover:scale-[1.02]"
    >
      <BookmarkIcon filled={false} />
      Saved Events
      <span
        className="absolute -right-3 -top-3 grid h-8 w-8 place-items-center rounded-full font-display text-base font-bold text-ink"
        style={{ background: CYAN }}
      >
        {count}
      </span>
    </button>
  );
});
