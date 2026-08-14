"use client";

import { forwardRef, memo } from "react";
import Link from "next/link";
import type { Event } from "@/lib/api";
import type { Bucket } from "@/lib/dimensions";

// Design tokens for the redesigned member surface.
export const SKY = "#8ED8F0"; // See more / drop tab
export const SKY_DEEP = "#1E9BD0"; // active save zone
export const SKY_TINT = "#CDEAF7";
export const BADGE = "#29B6E8";

/* ---------------- stepper ---------------- */

/**
 * One dot per bucket of the current "See events by" dimension. Jumping moves
 * the feed to that bucket's first program; it never filters the others out.
 *
 * The design shows organization logos here. There is no logo on a Host record
 * yet, so each bucket gets its colour and initials instead — the shape, size
 * and behaviour are the ones logos will slot into.
 */
export const BucketStepper = memo(function BucketStepper({
  buckets,
  activeId,
  onJump,
}: {
  buckets: Bucket[];
  activeId: string;
  onJump: (index: number) => void;
}) {
  if (buckets.length === 0) return null;
  return (
    <div className="mt-5 w-full max-w-3xl">
      <div className="relative flex items-center justify-between">
        {/* The rail sits behind the dots and stops short of both ends. With a
            single bucket there is nothing to connect, and a rail running off
            to nowhere reads as missing content. */}
        {buckets.length > 1 && (
          <div
            aria-hidden
            className="absolute left-6 right-6 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#D9D7E0]"
          />
        )}
        {buckets.map((bucket) => {
          const active = bucket.id === activeId;
          return (
            <button
              key={bucket.id}
              onClick={() => onJump(bucket.index)}
              aria-current={active ? "true" : undefined}
              title={bucket.label}
              className="relative z-10 flex flex-col items-center"
            >
              <span
                className="grid h-12 w-12 place-items-center rounded-full border-[3px] bg-white font-display text-sm font-bold transition-transform"
                style={{
                  borderColor: bucket.color,
                  color: bucket.color,
                  transform: active ? "scale(1.08)" : "none",
                }}
              >
                {initials(bucket.label)}
              </span>
              <span className="sr-only">{bucket.label}</span>
              <span
                aria-hidden
                className="mt-1.5 h-2 w-2 rounded-full transition-opacity"
                style={{
                  background: bucket.color,
                  opacity: active ? 1 : 0,
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
});

function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/* ---------------- the card ---------------- */

export const WideEventCard = memo(function WideEventCard({
  event,
  saved,
}: {
  event: Event;
  saved: boolean;
}) {
  return (
    <div className="flex h-full gap-6 p-5">
      <div className="relative aspect-[4/3] h-full max-h-[260px] shrink-0 overflow-hidden rounded-2xl bg-edge">
        {event.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.cover_image_url}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h2 className="font-display text-3xl font-extrabold leading-tight text-ink">
          {event.title}
        </h2>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-base text-ink">
          {event.starts_at && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon />
              {new Date(event.starts_at).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
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

        {event.description && (
          <p className="line-clamp-3 text-base leading-relaxed text-muted">
            {event.description}
          </p>
        )}

        <div className="mt-2 flex items-center gap-3">
          <Link
            href={`/events/${event.id}`}
            // Stops a drag that began on the link from being treated as a click.
            draggable={false}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded-lg px-4 py-2 font-medium text-ink transition-transform hover:scale-[1.03]"
            style={{ background: SKY }}
          >
            See more
          </Link>
          {saved && (
            <span className="font-semibold" style={{ color: SKY_DEEP }}>
              Saved ✓
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

function CalendarIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="shrink-0"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      width="16"
      height="16"
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

/* ---------------- save zone ---------------- */

export const SaveZone = memo(
  forwardRef<
    HTMLDivElement,
    {
      active: boolean;
      count: number;
      onSave: () => void;
      onOpen: () => void;
    }
  >(function SaveZone({ active, count, onSave, onOpen }, ref) {
    return (
      <div className="absolute bottom-8 left-1/2 z-30 -translate-x-1/2">
        {/* The tab that the card drops into, tucked behind the box. */}
        <div
          aria-hidden
          className="absolute -top-9 left-1/2 grid h-16 w-28 -translate-x-1/2 place-items-end justify-center rounded-b-[3rem] pb-2"
          style={{ background: SKY }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 9l6 6 6-6"
              stroke="#0B3A4A"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="relative">
          <button
            ref={ref as never}
            type="button"
            onClick={onSave}
            // The big control saves; the badge opens the list. Naming each for
            // what it does, since "Saved Events" on the save button read as the
            // way to see them.
            aria-label="Save this program"
            className="flex h-[104px] w-[min(88vw,420px)] flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-colors"
            style={{
              borderColor: active ? SKY_DEEP : "#B9B7C4",
              background: active ? SKY_TINT : "#F2F1F5",
            }}
          >
            <span className="flex items-center gap-2.5">
              <BookmarkIcon filled={active} />
              <span className="font-display text-2xl font-bold text-ink">
                Saved Events
              </span>
            </span>
            <span className="mt-1 text-base text-muted">
              Use ↓ or drag down to save event
            </span>
          </button>

          {/* The count doubles as the way into the saved list — the design has
              no separate button for it, and a badge showing what you have is
              the obvious thing to press to see it. */}
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open saved events, ${count} saved`}
            className="absolute -right-3 -top-4 grid h-11 w-11 place-items-center rounded-full font-display text-xl font-bold text-ink transition-transform hover:scale-105"
            style={{ background: BADGE }}
          >
            {count}
          </button>
        </div>
      </div>
    );
  }),
);

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={filled ? SKY_DEEP : "none"}
      stroke={filled ? SKY_DEEP : "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/* ---------------- grid view (placeholder) ---------------- */

/**
 * PLACEHOLDER. The three-column view is expected to change — this exists so the
 * toggle has somewhere real to go and so the feed is proven to render in a
 * second layout, not as a finished design.
 */
export const GridView = memo(function GridView({
  events,
  saved,
}: {
  events: Event[];
  saved: Set<string>;
}) {
  return (
    <div className="w-full max-w-6xl flex-1 overflow-y-auto pb-8">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <Link
            key={event.id}
            href={`/events/${event.id}`}
            className="flex flex-col overflow-hidden rounded-2xl bg-card text-left shadow-card ring-1 ring-black/5 transition-transform hover:-translate-y-1"
          >
            <div className="h-36 w-full bg-edge">
              {event.cover_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={event.cover_image_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-4">
              <h3 className="font-display text-lg font-bold leading-snug text-ink">
                {event.title}
              </h3>
              {event.starts_at && (
                <p className="text-sm text-muted">
                  {new Date(event.starts_at).toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              )}
              {event.location && (
                <p className="text-sm text-muted">{event.location}</p>
              )}
              {saved.has(event.id) && (
                <p className="mt-auto pt-1 font-semibold" style={{ color: SKY_DEEP }}>
                  Saved ✓
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
});
