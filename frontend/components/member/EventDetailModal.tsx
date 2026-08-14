"use client";

import { useEffect, useRef } from "react";
import type { Event } from "@/lib/api";
import { CYAN } from "@/components/member/FeedParts";

/**
 * The full listing, opened from a grid card.
 *
 * The card carries only what answers "is this for me?" — everything else waits
 * until someone asks for it, which is what keeps a grid of programs scannable
 * for people who find dense screens hard.
 */
export function EventDetailModal({
  event,
  saved,
  onClose,
  onSave,
  onOpenRegistration,
}: {
  event: Event;
  saved: boolean;
  onClose: () => void;
  onSave: (event: Event) => void;
  /** Only used when registration lives on the organizer's own site. */
  onOpenRegistration: (event: Event) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      restoreRef.current?.focus?.();
    };
  }, [onClose]);

  const external =
    event.requires_signup &&
    event.registration_mode === "external" &&
    !!event.registration_url;

  return (
    <div
      className="absolute inset-0 z-[60] grid place-items-center overflow-y-auto bg-white/40 px-6 py-10 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-detail-title"
    >
      <div className="relative w-full max-w-[680px]">
        {/* Outside the panel, as the design has it — the close control belongs
            to the overlay rather than competing with the listing. */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute -right-2 -top-4 z-10 grid h-12 w-12 place-items-center rounded-full border border-[#C9C7D2] bg-white text-xl text-ink shadow-sm transition-transform hover:scale-105"
        >
          ✕
        </button>

        <div
          ref={panelRef}
          tabIndex={-1}
          className="rounded-3xl bg-white p-8 shadow-lift outline-none"
        >
          {event.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.cover_image_url}
              alt=""
              className="mb-6 h-[290px] w-full rounded-xl object-cover"
            />
          )}

          <h2
            id="event-detail-title"
            className="font-display text-3xl font-extrabold leading-tight text-ink"
          >
            {event.title}
          </h2>

          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-lg text-ink">
            {event.starts_at && (
              <span className="inline-flex items-center gap-2">
                <CalendarIcon />
                {new Date(event.starts_at).toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
            {event.location && (
              <span className="inline-flex items-center gap-2">
                <PinIcon />
                {event.location}
              </span>
            )}
          </div>

          {event.description && (
            <p className="mt-5 whitespace-pre-line text-lg leading-relaxed text-ink">
              {event.description}
            </p>
          )}

          {event.notes && (
            <>
              <h3 className="mt-6 text-base font-medium uppercase tracking-wide text-muted">
                Notes
              </h3>
              <p className="mt-2 whitespace-pre-line text-lg leading-relaxed text-ink">
                {event.notes}
              </p>
            </>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {external && (
              <button
                onClick={() => onOpenRegistration(event)}
                className="rounded-lg px-6 py-3 font-display text-lg font-semibold text-ink transition-transform hover:scale-[1.03]"
                style={{ background: CYAN }}
              >
                Sign up on their site ↗
              </button>
            )}
            <button
              onClick={() => onSave(event)}
              disabled={saved}
              className={`rounded-lg px-6 py-3 font-display text-lg font-semibold text-ink transition-transform enabled:hover:scale-[1.03] disabled:opacity-60 ${
                external ? "border border-[#C9C7D2] bg-white" : ""
              }`}
              style={external ? undefined : { background: CYAN }}
            >
              {saved ? "Saved ✓" : "Save Event"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="18"
      height="18"
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
      width="18"
      height="18"
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
