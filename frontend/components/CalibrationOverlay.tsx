"use client";

import { useState } from "react";

// 9 points in a 3×3 grid, as viewport fractions.
const POINTS = [
  [0.1, 0.1],
  [0.5, 0.1],
  [0.9, 0.1],
  [0.1, 0.5],
  [0.5, 0.5],
  [0.9, 0.5],
  [0.1, 0.9],
  [0.5, 0.9],
  [0.9, 0.9],
] as const;

const CLICKS_PER_POINT = 3; // more clicks per dot = better regression fit

/**
 * Full-screen calibration: the user looks at each dot and clicks it a few
 * times, training WebGazer's gaze→screen mapping. Reports each click position
 * so the hook can feed it to webgazer.recordScreenPosition, and calls onDone
 * when all nine points are complete.
 */
export function CalibrationOverlay({
  onPoint,
  onDone,
  onCancel,
}: {
  onPoint: (x: number, y: number) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [counts, setCounts] = useState<number[]>(() => POINTS.map(() => 0));

  const done = counts.filter((c) => c >= CLICKS_PER_POINT).length;

  function clickDot(idx: number, e: React.MouseEvent) {
    onPoint(e.clientX, e.clientY);
    setCounts((prev) => {
      const nextCounts = [...prev];
      nextCounts[idx] = Math.min(CLICKS_PER_POINT, nextCounts[idx] + 1);
      if (nextCounts.every((c) => c >= CLICKS_PER_POINT)) {
        // Defer so state settles before we tear down the overlay.
        window.setTimeout(onDone, 150);
      }
      return nextCounts;
    });
  }

  return (
    <div className="fixed inset-0 z-[80] bg-ink/85 backdrop-blur-sm">
      <div className="absolute left-1/2 top-8 -translate-x-1/2 text-center text-white">
        <p className="font-display text-2xl font-extrabold">
          Calibrate eye tracking
        </p>
        <p className="mt-1 text-white/80">
          Look at each dot and click it until it fills. {done}/{POINTS.length}{" "}
          done.
        </p>
        <button
          onClick={onCancel}
          className="mt-3 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white hover:bg-white/25"
        >
          Cancel
        </button>
      </div>

      {POINTS.map(([fx, fy], idx) => {
        const filled = counts[idx];
        const complete = filled >= CLICKS_PER_POINT;
        return (
          <button
            key={idx}
            onClick={(e) => clickDot(idx, e)}
            aria-label={`Calibration point ${idx + 1}`}
            className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full transition-transform hover:scale-110"
            style={{
              left: `${fx * 100}%`,
              top: `${fy * 100}%`,
              width: 44,
              height: 44,
              background: complete ? "#22C55E" : "#E8318A",
              opacity: complete ? 1 : 0.4 + (filled / CLICKS_PER_POINT) * 0.6,
              boxShadow: "0 0 0 4px rgba(255,255,255,0.25)",
            }}
          >
            <span className="text-sm font-bold text-white">
              {complete ? "✓" : CLICKS_PER_POINT - filled}
            </span>
          </button>
        );
      })}
    </div>
  );
}
