"use client";

import { memo, useEffect, useRef } from "react";
import { DIMENSIONS, type Dimension, type DimensionKey } from "@/lib/dimensions";

/* ---------------- view toggle ---------------- */

export type ViewMode = "carousel" | "grid";

/** One card at a time, or a grid of them. */
export const ViewToggle = memo(function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="How to show programs"
      className="inline-flex items-center gap-1 rounded-full bg-[#E7E5EC] p-1"
    >
      {(["carousel", "grid"] as const).map((value) => {
        const active = mode === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={value === "carousel" ? "One at a time" : "Grid"}
            onClick={() => onChange(value)}
            className={`grid h-9 w-11 place-items-center rounded-full transition-colors ${
              active ? "bg-white shadow-sm" : "hover:bg-white/50"
            }`}
          >
            {value === "carousel" ? <CarouselIcon /> : <GridIcon />}
          </button>
        );
      })}
    </div>
  );
});

function CarouselIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none">
      <rect x="3" y="5" width="7" height="14" rx="2" fill="currentColor" />
      <rect
        x="13"
        y="5"
        width="8"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none">
      {[
        [4, 4],
        [13, 4],
        [4, 13],
        [13, 13],
      ].map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="7"
          height="7"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      ))}
    </svg>
  );
}

/* ---------------- see events by ---------------- */

export const SeeEventsBy = memo(function SeeEventsBy({
  dimension,
  open,
  onOpenChange,
  onSelect,
}: {
  dimension: Dimension;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (key: DimensionKey) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape, and put focus back on the trigger —
  // otherwise keyboard focus is stranded inside a menu that is no longer there.
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) onOpenChange(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Deliberately not stopping propagation: swallowing it here meant an
      // Escape that closed this menu never reached the saved-events panel, so
      // dismissing both took two presses for no visible reason.
      onOpenChange(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={wrapRef} className="relative flex flex-col items-center">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        See events by
      </p>
      {/* The page's heading, and the control that changes it. Screen-reader
          users navigate by heading; without one this screen has nothing to
          land on. */}
      <h1 className="mt-0.5">
        <button
          ref={triggerRef}
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="inline-flex items-center gap-3 font-display text-4xl font-extrabold text-ink sm:text-5xl"
        >
          {dimension.heading}
          <span
            aria-hidden
            className={`transition-transform ${open ? "" : "rotate-180"}`}
          >
            <ChevronUp />
          </span>
        </button>
      </h1>

      {open && (
        <div
          role="menu"
          aria-label="See events by"
          className="absolute top-full z-50 mt-3 w-[22rem] rounded-2xl border border-edge bg-white p-2 shadow-lift"
        >
          {DIMENSIONS.map((d) => {
            const active = d.key === dimension.key;
            return (
              <button
                key={d.key}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onSelect(d.key);
                  onOpenChange(false);
                }}
                className={`flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left text-xl text-ink transition-colors hover:bg-[#E7E5EC] ${
                  active ? "bg-[#E7E5EC] font-semibold" : ""
                }`}
              >
                <span aria-hidden className="w-6 text-center text-lg">
                  {d.emoji}
                </span>
                {d.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

function ChevronUp() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 15l6-6 6 6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---------------- account chip ---------------- */

export const AccountChip = memo(function AccountChip({
  name,
  onClick,
}: {
  /** Null when signed out. */
  name: string | null;
  onClick: () => void;
}) {
  const signedIn = name !== null;
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-white/70"
    >
      <span
        aria-hidden
        className={`grid h-9 w-9 place-items-center rounded-full ${
          // Signed out was white on #D7D5DE — about 1.3:1, effectively
          // invisible to anyone with low vision.
          signedIn ? "bg-[#E8318A] text-white" : "bg-[#6B6879] text-white"
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="9" r="3.4" fill="currentColor" />
          <path
            d="M5.5 19c1.4-3 4-4.4 6.5-4.4S17.1 16 18.5 19"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="font-medium text-ink">{name ?? "Not Logged In"}</span>
    </button>
  );
});
