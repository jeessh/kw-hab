"use client";

import { memo, useEffect, useRef, useState } from "react";
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
            className={`grid h-11 w-12 place-items-center rounded-full transition-colors ${
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
  align = "center",
}: {
  dimension: Dimension;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (key: DimensionKey) => void;
  /** The grid puts this in the top-left corner rather than centred. */
  align?: "center" | "left";
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
    <div
      ref={wrapRef}
      className={`relative flex flex-col ${
        align === "left" ? "items-start" : "items-center"
      }`}
    >
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
          // min-h so the grid's smaller heading still clears 44px. Text-sized
          // buttons inherit the line box, and at text-3xl that came to 36.
          className={`inline-flex min-h-[44px] items-center gap-3 font-display font-extrabold text-ink ${
            align === "left" ? "text-3xl" : "text-4xl sm:text-5xl"
          }`}
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
          className={`absolute top-full z-50 mt-3 w-[22rem] rounded-2xl border border-edge bg-white p-2 shadow-lift ${
            align === "left" ? "left-0" : ""
          }`}
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

/**
 * Who you are, and the way in or out.
 *
 * Signed out it signs you in. Signed in it opens a menu, because the previous
 * behaviour was that pressing your own name signed you out on the spot — no
 * confirmation, no label saying that's what it did, on a control someone might
 * press just to check who they were logged in as. Sign-out is a deliberate
 * choice now, and it says so.
 */
export const AccountChip = memo(function AccountChip({
  name,
  onSignIn,
  onSignOut,
}: {
  /** Null when signed out. */
  name: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const signedIn = name !== null;
  const [open, setOpen] = useState(false);

  // Close on outside press or Escape, the same way the other menus here do.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-account-menu]")) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" data-account-menu>
    <button
      onClick={() => (signedIn ? setOpen((v) => !v) : onSignIn())}
      aria-haspopup={signedIn ? "menu" : undefined}
      aria-expanded={signedIn ? open : undefined}
      className="inline-flex min-h-[44px] items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-white/70"
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
      {signedIn && (
        <span aria-hidden className="text-muted">
          ▾
        </span>
      )}
    </button>

      {open && signedIn && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 min-w-[200px] overflow-hidden rounded-xl bg-white py-1 shadow-lift ring-1 ring-black/5"
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="flex min-h-[48px] w-full items-center gap-2.5 px-4 text-left text-lg font-medium text-ink transition-colors hover:bg-[#F2F1F5]"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5M21 12H9" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
});
