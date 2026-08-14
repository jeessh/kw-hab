"use client";

import { memo, useMemo } from "react";
import type { Event } from "@/lib/api";
import type { Dimension } from "@/lib/dimensions";
import { repeatLabel } from "@/lib/recurrence";
import { CYAN, SKY_DEEP } from "@/components/member/FeedParts";

const TAG = "#F5C449"; // organization pill on the card image

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
              // Date as well as time. The grid used to be sectioned by day, so
              // the heading above carried the date and the card only needed the
              // hour; sectioning by organization or topic took that away.
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon />
                {new Date(event.starts_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
                {", "}
                {new Date(event.starts_at).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            )}
            {repeatLabel(event.recurrence) && (
              <span className="inline-flex items-center gap-1.5">
                <RepeatIcon />
                {repeatLabel(event.recurrence)}
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
        // Anchored to the top of the text block (the image is a fixed 152px),
        // beside the title. It used to hang off the bottom edge by a measured
        // offset, which only lined up while every card was the same height —
        // adding the date and how often it repeats made them all different, and
        // the bookmark drifted into the middle of the text.
        // 44×44, not the icon's 36: this sits inside the card-sized "Open"
        // button, so every pixel missed here opens the listing instead of
        // saving — the one control on the card that undoes a save was also the
        // easiest one to miss.
        className="absolute right-1.5 top-[160px] grid h-11 w-11 place-items-center rounded-lg transition-transform hover:scale-110"
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

function RepeatIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden
    >
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
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

/**
 * The grid's sections, from the "See events by" choice.
 *
 * The dropdown sat above this grid doing nothing at all — picking Activity Type
 * where Non-Profit Organization had been returned a byte-identical list. It
 * only ever drove the one-at-a-time view's stepper.
 *
 * It groups, it does not filter: every program is in exactly one section and
 * none are removed, which is the same rule the stepper follows.
 */
function groupByDimension(
  events: Event[],
  dimension: Dimension,
): { id: string; label: string; color: string; events: Event[] }[] {
  const sections = new Map<
    string,
    { id: string; label: string; color: string; events: Event[] }
  >();
  for (const event of events) {
    const b = dimension.bucket(event);
    const found = sections.get(b.id);
    if (found) found.events.push(event);
    else sections.set(b.id, { ...b, events: [event] });
  }
  return [...sections.values()];
}

export const GridFeed = memo(function GridFeed({
  events,
  dimension,
  saved,
  query,
  onOpen,
  onToggleSave,
}: {
  events: Event[];
  /** Which "See events by" choice sections the grid. */
  dimension: Dimension;
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

  const sections = useMemo(
    () => groupByDimension(filtered, dimension),
    [filtered, dimension],
  );

  if (filtered.length === 0) {
    return (
      <p className="mt-16 text-center font-display text-2xl text-muted">
        Nothing matches that.
      </p>
    );
  }

  return (
    <div className="w-full max-w-6xl flex-1 overflow-y-auto pb-10">
      {sections.map((section) => (
        <section key={section.id} className="mb-10">
          <h2 className="mb-4 flex items-baseline gap-3 font-display text-2xl text-ink">
            <span
              aria-hidden
              className="inline-block h-3 w-3 shrink-0 translate-y-px rounded-full"
              style={{ background: section.color }}
            />
            <span className="font-bold">{section.label}</span>
            <span className="text-muted">{section.events.length}</span>
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {section.events.map((ev) => (
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
