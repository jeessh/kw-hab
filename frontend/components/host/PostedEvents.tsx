"use client";

import { memo, useMemo, useState } from "react";
import type { Event } from "@/lib/api";
import { CATEGORIES } from "@/lib/categories";
import { ACTIVITY_TYPES } from "@/lib/activities";

export const CYAN = "#35CDEE";

/* ---------------- filters ---------------- */

export type HostFilters = {
  orgs: string[];
  price: string[]; // "free" | "paid"
  registration: string[]; // "dropin" | "required"
  eventType: string[]; // "virtual" | "inperson" | "youth"
  activity: string[];
  category: string[];
};

export const NO_HOST_FILTERS: HostFilters = {
  orgs: [],
  price: [],
  registration: [],
  eventType: [],
  activity: [],
  category: [],
};

export function applyHostFilters(
  events: Event[],
  f: HostFilters,
  query: string,
): Event[] {
  const q = query.trim().toLowerCase();
  return events.filter((ev) => {
    if (f.orgs.length && !f.orgs.includes(ev.host_name)) return false;
    if (f.price.length) {
      const key = ev.is_free ? "free" : "paid";
      if (!f.price.includes(key)) return false;
    }
    if (f.registration.length) {
      const key = ev.requires_signup ? "required" : "dropin";
      if (!f.registration.includes(key)) return false;
    }
    if (f.eventType.length) {
      // Any-of: a youth in-person program matches either box, which is what
      // ticking two boxes reads as.
      const keys = [
        ev.is_virtual ? "virtual" : "inperson",
        ...(ev.is_youth ? ["youth"] : []),
      ];
      if (!f.eventType.some((k) => keys.includes(k))) return false;
    }
    if (f.activity.length && !f.activity.includes(ev.activity_type ?? ""))
      return false;
    if (f.category.length && !f.category.includes(ev.category ?? ""))
      return false;
    if (q) {
      const hay = [ev.title, ev.description, ev.location, ev.host_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

type Group = { key: keyof HostFilters; label: string; emoji: string };

const GROUPS: Group[] = [
  { key: "orgs", label: "Non-Profit Org.", emoji: "🏢" },
  { key: "price", label: "Price", emoji: "💲" },
  { key: "registration", label: "Registration Type", emoji: "📋" },
  { key: "eventType", label: "Event Type", emoji: "🗂️" },
  { key: "activity", label: "Activity Type", emoji: "🎉" },
];

export const FilterPanel = memo(function FilterPanel({
  orgs,
  filters,
  onChange,
}: {
  orgs: string[];
  filters: HostFilters;
  onChange: (next: HostFilters) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const optionsFor = (key: keyof HostFilters): { value: string; label: string }[] => {
    switch (key) {
      case "orgs":
        return orgs.map((o) => ({ value: o, label: o }));
      case "price":
        return [
          { value: "free", label: "Free" },
          { value: "paid", label: "Paid" },
        ];
      case "registration":
        return [
          { value: "dropin", label: "Drop-In" },
          { value: "required", label: "Registration Required" },
        ];
      case "eventType":
        return [
          { value: "virtual", label: "Virtual" },
          { value: "inperson", label: "In-person" },
          { value: "youth", label: "Youth" },
        ];
      case "activity":
        return ACTIVITY_TYPES.map((a) => ({ value: a.label, label: a.label }));
      default:
        return CATEGORIES.map((c) => ({ value: c.label, label: c.label }));
    }
  };

  function toggle(key: keyof HostFilters, value: string) {
    const cur = filters[key];
    onChange({
      ...filters,
      [key]: cur.includes(value)
        ? cur.filter((v) => v !== value)
        : [...cur, value],
    });
  }

  return (
    <aside className="w-full max-w-[430px] shrink-0">
      <p className="text-sm font-medium uppercase tracking-wide text-muted">
        See events by
      </p>
      <div className="mt-2 rounded-2xl border border-[#C9C7D2] bg-white p-4">
        {GROUPS.map((g) => {
          const isOpen = open[g.key] ?? false;
          const options = optionsFor(g.key);
          const chosen = filters[g.key];
          return (
            <div key={g.key} className="py-1.5">
              <button
                onClick={() => setOpen((o) => ({ ...o, [g.key]: !isOpen }))}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-4 py-1.5 text-left"
              >
                <span aria-hidden className="w-5 text-center">
                  {g.emoji}
                </span>
                <span className="flex-1 text-xl text-ink">{g.label}</span>
                {chosen.length > 0 && (
                  <span
                    className="grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-sm font-bold text-ink"
                    style={{ background: CYAN }}
                  >
                    {chosen.length}
                  </span>
                )}
                <span
                  aria-hidden
                  className={`text-muted transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                >
                  ⌄
                </span>
              </button>

              {isOpen && (
                <div className="ml-9 mt-1 flex flex-col gap-2 pb-2">
                  {options.length === 0 && (
                    <p className="text-base text-muted">Nothing to filter by yet.</p>
                  )}
                  {options.map((o) => (
                    <label
                      key={o.value}
                      className="flex items-center gap-3 text-lg text-ink"
                    >
                      <input
                        type="checkbox"
                        checked={chosen.includes(o.value)}
                        onChange={() => toggle(g.key, o.value)}
                        className="h-5 w-5 rounded"
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <button
          onClick={() => onChange(NO_HOST_FILTERS)}
          className="mt-1 flex w-full items-center gap-4 py-2 text-left"
        >
          <span aria-hidden className="w-5 text-center text-muted">
            ○
          </span>
          <span className="text-xl text-ink">All Events</span>
        </button>
      </div>
    </aside>
  );
});

/* ---------------- event card ---------------- */

export const PostedEventCard = memo(function PostedEventCard({
  event,
  canDelete,
  onEdit,
  onShare,
  onDelete,
}: {
  event: Event;
  /** Removal reaches beyond one agency, so only superadmins see it. */
  canDelete: boolean;
  onEdit: (event: Event) => void;
  onShare: (event: Event) => void;
  onDelete: (event: Event) => void;
}) {
  return (
    <article className="rounded-2xl border border-[#C9C7D2] bg-white p-5">
      <div className="flex gap-5">
        <button
          onClick={() => onEdit(event)}
          aria-label={`Edit ${event.title}`}
          className="h-[150px] w-[150px] shrink-0 overflow-hidden rounded-xl bg-[#BDBDBD]"
        >
          {event.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.cover_image_url}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#22C55E]" />
              Posted by {event.host_name}
            </p>
            <div className="flex gap-2">
              <Pill tone="green">{event.is_free ? "Free" : "Paid"}</Pill>
              <Pill tone="pink">
                {event.requires_signup ? "Registration" : "Drop-in"}
              </Pill>
              {event.is_virtual && <Pill tone="blue">Virtual</Pill>}
              {event.is_youth && <Pill tone="amber">Youth</Pill>}
            </div>
          </div>

          <button
            onClick={() => onEdit(event)}
            className="mt-1 block text-left font-display text-2xl font-bold text-ink hover:underline"
          >
            {event.title}
          </button>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-base text-ink">
            {event.starts_at && (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <ClockIcon />
                  {new Date(event.starts_at).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon />
                  {new Date(event.starts_at).toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </>
            )}
            {event.location && (
              <span className="inline-flex items-center gap-1.5">
                <PinIcon />
                {event.location}
              </span>
            )}
          </div>

          {event.description && (
            <p className="mt-2 line-clamp-3 text-base leading-relaxed text-ink">
              {event.description}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <IconButton label={`Print ${event.title}`} onClick={() => window.print()}>
          <PrinterIcon />
        </IconButton>
        <IconButton label={`Share ${event.title}`} onClick={() => onShare(event)}>
          <SendIcon />
        </IconButton>
        {canDelete && (
          <button
            onClick={() => onDelete(event)}
            aria-label={`Delete ${event.title}`}
            className="grid h-8 w-8 place-items-center rounded-full bg-[#F8C9D4] text-[#C2185B] transition-transform hover:scale-110"
          >
            <TrashIcon />
          </button>
        )}
      </div>
    </article>
  );
});

function Pill({
  tone,
  children,
}: {
  tone: "green" | "pink" | "blue" | "amber";
  children: React.ReactNode;
}) {
  const tones = {
    green: "bg-[#A8E6A3] text-[#14532D]",
    pink: "bg-[#F9A8D4] text-[#831843]",
    blue: "bg-[#A5D8F5] text-[#0B3A4A]",
    amber: "bg-[#FBD38D] text-[#7B341E]",
  } as const;
  return (
    <span
      className={`rounded-md px-3 py-1 text-sm font-semibold uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="text-ink transition-transform hover:scale-110"
    >
      {children}
    </button>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0" aria-hidden>
      <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function PrinterIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9V3h12v6M6 18H4v-6h16v6h-2" />
      <rect x="6" y="14" width="12" height="7" rx="1" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 3L3 10.5l7 2.5 2.5 7L21 3z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" />
    </svg>
  );
}

/* ---------------- toast ---------------- */

/**
 * Confirms what happened, with a way back.
 *
 * Undo matters more than the confirmation does: publishing to a shared calendar
 * and removing something other agencies' members have saved are both actions
 * where "wait, no" arrives a second late.
 */
export const UndoToast = memo(function UndoToast({
  message,
  tone,
  onUndo,
  onDismiss,
}: {
  message: string;
  tone: "posted" | "deleted";
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="fixed left-1/2 top-6 z-50 w-[min(92vw,540px)] -translate-x-1/2 rounded-2xl border-2 bg-white p-6 shadow-lift"
      style={{ borderColor: tone === "posted" ? "#5BD75B" : "#E05070" }}
    >
      <p className="text-xl text-ink">{message}</p>
      <div className="mt-3 flex gap-3">
        <button
          onClick={onUndo}
          className="rounded-lg bg-[#D9D9D9] px-4 py-2 font-medium text-ink transition-colors hover:bg-[#CDCDCD]"
        >
          Undo
        </button>
        <button
          onClick={onDismiss}
          className="rounded-lg px-4 py-2 font-medium text-muted hover:text-ink"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
});

/* ---------------- confirm ---------------- */

export const ConfirmDelete = memo(function ConfirmDelete({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/10 px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
    >
      <div className="w-full max-w-[600px] rounded-2xl bg-white p-8 shadow-lift">
        <h2
          id="confirm-delete-title"
          className="font-display text-2xl font-bold text-ink"
        >
          Are you sure you want to delete this event?
        </h2>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg bg-[#D9D9D9] px-5 py-2.5 font-display text-lg font-semibold text-ink hover:bg-[#CDCDCD]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg px-5 py-2.5 font-display text-lg font-semibold text-ink transition-transform hover:scale-[1.02]"
            style={{ background: CYAN }}
          >
            Yes, delete
          </button>
        </div>
      </div>
    </div>
  );
});

export { applyHostFilters as filterPosted };
export const useHostFilters = () => useState<HostFilters>(NO_HOST_FILTERS);
