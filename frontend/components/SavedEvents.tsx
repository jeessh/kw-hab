"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { api, type Event, type Me } from "@/lib/api";
import { emojiFor } from "@/lib/icons";
import { FOCUSABLE } from "@/components/Modal";
import { CYAN } from "@/components/member/FeedParts";
import { GridCard, SearchBox } from "@/components/member/GridFeed";

function isUpcoming(ev: Event): boolean {
  if (!ev.starts_at) return true; // undated → still to come
  return new Date(ev.starts_at).getTime() >= Date.now();
}

const startMs = (e: Event) =>
  e.starts_at ? new Date(e.starts_at).getTime() : 0;

type Props = {
  /** Null when signed out — there is no list to show, only a way to get one. */
  me: Me | null;
  reveal: number;
  onClose: () => void;
  onSignIn: () => void;
  /** Ids currently saved, so a row can be un-saved without leaving the list. */
  saved: Set<string>;
  onToggleSave: (event: Event) => void;
  onOpen: (event: Event) => void;
};

export const SavedEvents = memo(function SavedEvents({
  me,
  reveal,
  onClose,
  onSignIn,
  saved,
  onToggleSave,
  onOpen,
}: Props) {
  const open = reveal > 0;
  const [events, setEvents] = useState<Event[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");

  const prevOpen = useRef(false);
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    const justOpened = open && !prevOpen.current;
    prevOpen.current = open;
    if (!open || !me) return;
    if (!justOpened && loadedFor.current === me.id) return;
    loadedFor.current = me.id;
    setLoading(true);
    setError(false);
    api<Event[]>("/users/me/events")
      .then(setEvents)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open, me]);

  // Dialog focus management. Gated on reveal >= 1 so a drag "peek" doesn't
  // steal focus mid-gesture. Escape is handled globally by EventsView.
  const fullyOpen = reveal >= 1;
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!fullyOpen) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();

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

  const sections = useMemo(() => {
    const all = events ?? [];
    const q = query.trim().toLowerCase();
    const matching = q
      ? all.filter((ev) =>
          [ev.title, ev.location, ev.host_name, ev.category]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : all;

    const upcoming = matching
      .filter(isUpcoming)
      .sort((a, b) => startMs(a) - startMs(b));

    // Then the same programs again, grouped by topic — the design's second and
    // third rows. Someone looking for "that cooking thing" gets a shorter list
    // to scan than the whole of what they've saved.
    const byCategory = new Map<string, Event[]>();
    for (const ev of upcoming) {
      const key = ev.category || "Other";
      const list = byCategory.get(key);
      if (list) list.push(ev);
      else byCategory.set(key, [ev]);
    }

    const past = matching
      .filter((e) => !isUpcoming(e))
      .sort((a, b) => startMs(b) - startMs(a));

    return { upcoming, byCategory: [...byCategory.entries()], past };
  }, [events, query]);

  if (!open) return null;

  const emoji = me?.icons?.[0] ? emojiFor(me.icons[0]) : "🔖";

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="absolute inset-0 z-20 overflow-y-auto bg-white outline-none"
      style={{ opacity: reveal }}
      role="dialog"
      aria-modal="true"
      aria-label="Saved events"
    >
      <div className="mx-auto w-full max-w-6xl px-8 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="flex items-center gap-3 font-display text-4xl font-extrabold tracking-tight text-ink">
            {/* Their own sign-in icon, so the list is visibly theirs. */}
            <span aria-hidden>{emoji}</span>
            {me ? `${me.first_name}'s Saved Events` : "Saved Events"}
          </h1>
          <div className="flex items-center gap-3">
            {me && <SearchBox value={query} onChange={setQuery} />}
            <button
              onClick={onClose}
              aria-label="Close saved events"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#C9C7D2] bg-white text-lg text-ink transition hover:scale-105"
            >
              ✕
            </button>
          </div>
        </div>

        {!me ? (
          <div className="mt-24 grid place-items-center gap-4 text-center">
            <div className="text-5xl" aria-hidden>
              🗓️
            </div>
            <p className="font-display text-2xl font-bold text-ink">
              Sign in to keep events
            </p>
            <button
              onClick={onSignIn}
              className="rounded-xl px-8 py-4 font-display text-xl font-semibold text-ink"
              style={{ background: CYAN }}
            >
              Sign in
            </button>
          </div>
        ) : (
          <>
            {loading && events === null && (
              <p className="mt-16 text-center text-muted">
                Loading your events…
              </p>
            )}
            {error && events === null && (
              <p role="alert" className="mt-16 text-center font-semibold text-pop">
                Couldn&apos;t load your events. Please refresh and try again.
              </p>
            )}
            {events !== null &&
              !loading &&
              sections.upcoming.length === 0 &&
              sections.past.length === 0 && <EmptyAll searching={!!query} />}

            {sections.upcoming.length > 0 && (
              <Row
                title="Upcoming Events"
                count={sections.upcoming.length}
                events={sections.upcoming}
                saved={saved}
                onOpen={onOpen}
                onToggleSave={onToggleSave}
              />
            )}

            {sections.byCategory.map(([category, evs]) => (
              <Row
                key={category}
                title={category}
                count={evs.length}
                events={evs}
                saved={saved}
                onOpen={onOpen}
                onToggleSave={onToggleSave}
              />
            ))}

            {sections.past.length > 0 && (
              <Row
                title="Past Events"
                count={sections.past.length}
                events={sections.past}
                saved={saved}
                onOpen={onOpen}
                onToggleSave={onToggleSave}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
});

/**
 * One horizontally scrolling row of programs.
 *
 * The same card as the grid, so a program looks the same wherever it turns up —
 * one thing to learn to recognise rather than three.
 */
function Row({
  title,
  count,
  events,
  saved,
  onOpen,
  onToggleSave,
}: {
  title: string;
  count: number;
  events: Event[];
  saved: Set<string>;
  onOpen: (event: Event) => void;
  onToggleSave: (event: Event) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollRight() {
    scrollerRef.current?.scrollBy({ left: 320, behavior: "smooth" });
  }

  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-3 font-display text-2xl font-semibold text-ink">
        {title}
        <span
          className="grid h-7 min-w-7 place-items-center rounded-full px-2 text-sm font-bold text-ink"
          style={{ background: CYAN }}
        >
          {count}
        </span>
      </h2>

      <div className="relative mt-4">
        <div
          ref={scrollerRef}
          className="flex gap-5 overflow-x-auto pb-2"
          // Rows are their own scroll region; say so rather than leaving a
          // keyboard user to discover it.
          tabIndex={0}
          role="group"
          aria-label={`${title}, ${count} programs`}
        >
          {events.map((ev) => (
            <div key={ev.id} className="w-[290px] shrink-0">
              <GridCard
                event={ev}
                saved={saved.has(ev.id)}
                onOpen={onOpen}
                onToggleSave={onToggleSave}
              />
            </div>
          ))}
        </div>

        {events.length > 3 && (
          <button
            onClick={scrollRight}
            aria-label={`Show more ${title}`}
            className="absolute -right-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-2xl text-ink shadow-card transition-transform hover:scale-105"
          >
            <span aria-hidden>›</span>
          </button>
        )}
      </div>
    </section>
  );
}

function EmptyAll({ searching }: { searching: boolean }) {
  return (
    <div className="mt-24 grid place-items-center gap-3 text-center">
      <div className="text-5xl" aria-hidden>
        🗓️
      </div>
      <p className="font-display text-2xl font-bold text-ink">
        {searching ? "Nothing matches that." : "No saved events yet"}
      </p>
      {!searching && (
        <p className="max-w-sm text-muted">
          Programs you save show up here.
        </p>
      )}
    </div>
  );
}
