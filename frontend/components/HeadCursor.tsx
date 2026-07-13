"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import type { CursorState } from "@/lib/useHeadTracking";

const ACCENT = "#5B5BD6";

const ZONE_LABEL: Record<string, string> = {
  left: "← Back",
  right: "Next →",
  up: "↑ Settings",
  down: "↓ Save",
};

// Persistent head-pointer cursor: a simple circle that follows the smoothed
// head point. While an edge zone is arming, the circle fills bottom-up with a
// translucent layer showing dwell progress. Dim when the signal is stale.
export function HeadCursor({ cursor }: { cursor: CursorState }) {
  // Hold the last point so the cursor doesn't vanish on dropped frames; sit at
  // screen center until the first prediction arrives.
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  if (cursor.visible) lastRef.current = { x: cursor.x, y: cursor.y };
  const pos = lastRef.current ?? {
    x: typeof window !== "undefined" ? window.innerWidth / 2 : 0,
    y: typeof window !== "undefined" ? window.innerHeight / 2 : 0,
  };

  const stale = !cursor.visible;
  const active = cursor.stage !== "idle" && !!cursor.zone;
  const size = active ? 64 : 56;

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]" aria-hidden>
      {active && <EdgeGlow zone={cursor.zone!} color={ACCENT} />}

      <motion.div
        className="absolute"
        style={{ left: 0, top: 0 }}
        animate={{ x: pos.x, y: pos.y }}
        transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.4 }}
      >
        <div
          className="relative -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"
          style={{
            width: size,
            height: size,
            border: `3px solid ${ACCENT}`,
            background: `${ACCENT}14`,
            boxShadow: `0 0 14px ${ACCENT}55`,
            opacity: stale ? 0.3 : 1,
            transition:
              "opacity 200ms ease, width 160ms ease, height 160ms ease",
          }}
        >
          {/* dwell progress: translucent fill rising from the bottom */}
          <div
            className="absolute inset-x-0 bottom-0"
            style={{
              height: `${active ? cursor.progress * 100 : 0}%`,
              background: `${ACCENT}59`,
            }}
          />
        </div>
      </motion.div>

      {/* label of the pending action */}
      {active && (
        <div
          className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full px-4 py-1.5 text-sm font-semibold text-white shadow-lg"
          style={{ background: ACCENT }}
        >
          Hold… {ZONE_LABEL[cursor.zone!]}
        </div>
      )}
    </div>
  );
}

function EdgeGlow({ zone, color }: { zone: string; color: string }) {
  const common = "absolute";
  const grad = (dir: string) =>
    `linear-gradient(${dir}, ${color}55, ${color}00)`;
  if (zone === "left")
    return (
      <div
        className={`${common} inset-y-0 left-0 w-40`}
        style={{ background: grad("to right") }}
      />
    );
  if (zone === "right")
    return (
      <div
        className={`${common} inset-y-0 right-0 w-40`}
        style={{ background: grad("to left") }}
      />
    );
  if (zone === "up")
    return (
      <div
        className={`${common} inset-x-0 top-0 h-40`}
        style={{ background: grad("to bottom") }}
      />
    );
  return (
    <div
      className={`${common} inset-x-0 bottom-0 h-40`}
      style={{ background: grad("to top") }}
    />
  );
}
