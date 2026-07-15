"use client";

import { memo, useEffect, useRef, useState } from "react";
import { api, type Event, type Me } from "@/lib/api";
import { categoryStyle } from "@/lib/categories";
import { FOCUSABLE } from "@/components/Modal";

// ---- date helpers ----
const DAY = 86_400_000;

function isUpcoming(ev: Event): boolean {
  if (!ev.starts_at) return true; // undated → assume it's still to come
  return new Date(ev.starts_at).getTime() >= Date.now();
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "Date TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date TBD";
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function countdownLabel(iso?: string | null): string {
  if (!iso) return "Upcoming";
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return "Upcoming";
  const days = Math.round(ms / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? "In 1 week" : `In ${weeks} weeks`;
}

const startMs = (e: Event) =>
  e.starts_at ? new Date(e.starts_at).getTime() : 0;

type Props = {
  me: Me | null;
  reveal: number;
  onClose: () => void;
};

export const SavedEvents = memo(function SavedEvents({
  me,
  reveal,
  onClose,
}: Props) {
  const open = reveal > 0;
  const [events, setEvents] = useState<Event[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Refetch on each open so newly-attended events appear; stale data stays
  // visible while it runs (loading/error only block when we have none).
  const prevOpen = useRef(false);
  useEffect(() => {
    const justOpened = open && !prevOpen.current;
    prevOpen.current = open;
    if (!justOpened) return;
    setLoading(true);
    setError(false);
    api<Event[]>("/users/me/events")
      .then(setEvents)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open]);

  // Dialog focus management (Modal.tsx-style): once fully open, move focus in,
  // trap Tab, and restore on close. Gated on reveal >= 1 so a drag "peek"
  // doesn't steal focus mid-gesture. Escape is handled globally by EventsView.
  const fullyOpen = reveal >= 1;
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!fullyOpen) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || active === panel)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      restoreRef.current?.focus?.();
    };
  }, [fullyOpen]);

  if (!open) return null;

  const list = events ?? [];
  const upcoming = list
    .filter(isUpcoming)
    .sort((a, b) => startMs(a) - startMs(b));
  const past = list
    .filter((e) => !isUpcoming(e))
    .sort((a, b) => startMs(b) - startMs(a));

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="absolute inset-0 z-20 overflow-y-auto outline-none"
      style={{ opacity: reveal }}
      role="dialog"
      aria-modal="true"
      aria-label="Saved events"
    >
      <div className="min-h-full bg-[radial-gradient(120%_80%_at_50%_-10%,#ffffff_0%,#EEEBF5_55%,#E6E1F2_100%)]">
        <div className="mx-auto w-full max-w-5xl px-6 py-10">
          {/* header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">
                Saved Events
              </h1>
              {me && (
                <p className="mt-1 text-muted">
                  {me.first_name} {me.last_name}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close saved events"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-lg text-ink shadow-card transition hover:scale-105 focus-visible:scale-105"
            >
              ✕
            </button>
          </div>

          {/* first-load states only; once we have data it stays visible on refetch */}
          {loading && events === null && (
            <p className="mt-16 text-center text-muted">Loading your events…</p>
          )}
          {error && events === null && (
            <p role="alert" className="mt-16 text-center font-semibold text-pop">
              Couldn’t load your events. Please refresh and try again.
            </p>
          )}
          {events !== null && !loading && list.length === 0 && <EmptyAll />}

          {upcoming.length > 0 && (
            <Section icon="⏰" title="Upcoming Events" count={upcoming.length}>
              {upcoming.map((e) => (
                <SavedEventCard key={e.id} event={e} />
              ))}
            </Section>
          )}

          {past.length > 0 && (
            <Section icon="✓" title="Past Events" count={past.length}>
              {past.map((e) => (
                <SavedEventCard key={e.id} event={e} past />
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
});

/* ---------------- sections & cards ---------------- */

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: string;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-ink">
        <span aria-hidden>{icon}</span>
        {title}
        <span className="ml-1 rounded-full bg-white px-2.5 py-0.5 text-sm font-semibold text-muted shadow-sm">
          {count}
        </span>
      </h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

function SavedEventCard({ event, past }: { event: Event; past?: boolean }) {
  const cat = categoryStyle(event.category);
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-black/5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lift">
      {/* colored banner: countdown for upcoming, "Attended" for past */}
      <div
        className="flex items-center justify-between px-4 py-1.5 text-sm font-semibold text-white"
        style={{ backgroundColor: past ? "#8A8AA0" : cat.color }}
      >
        <span>{past ? "Attended" : countdownLabel(event.starts_at)}</span>
        <span aria-hidden>{past ? "✓" : cat.emoji}</span>
      </div>

      {/* cover */}
      <div className="relative h-40 w-full overflow-hidden bg-edge">
        {event.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.cover_image_url}
            alt=""
            draggable={false}
            className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${
              past ? "grayscale" : ""
            }`}
          />
        ) : (
          <div
            className="grid h-full w-full place-items-center text-5xl"
            style={{
              background: `linear-gradient(135deg, ${cat.color}22, ${cat.color}05)`,
            }}
            aria-hidden
          >
            {cat.emoji}
          </div>
        )}
        {event.category && (
          <span className="absolute left-3 top-3 rounded-full bg-ink/80 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {cat.emoji} {event.category}
          </span>
        )}
      </div>

      {/* body */}
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="font-display text-lg font-bold leading-snug text-ink">
          {event.title}
        </h3>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1">
            <CalendarIcon />
            {fmtDate(event.starts_at)}
          </span>
          {event.location && (
            <span className="inline-flex items-center gap-1">
              <PinIcon />
              {event.location}
            </span>
          )}
        </div>
        {event.description && (
          <p className="line-clamp-3 text-sm text-muted">{event.description}</p>
        )}
        {event.host_name && (
          <p className="mt-auto pt-1 text-xs font-medium text-muted/80">
            by {event.host_name}
          </p>
        )}
      </div>
    </article>
  );
}

function EmptyAll() {
  return (
    <div className="mt-16 grid place-items-center gap-3 text-center">
      <div className="text-5xl" aria-hidden>
        🗓️
      </div>
      <p className="font-display text-2xl font-bold text-ink">
        No saved events yet
      </p>
      <p className="max-w-sm text-muted">
        Events you attend show up here. Hold a card to attend one.
      </p>
    </div>
  );
}

/* ---------------- icons ---------------- */

function CalendarIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
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
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden
    >
      <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
