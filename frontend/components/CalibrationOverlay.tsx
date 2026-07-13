"use client";

import { useEffect, useState } from "react";

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

// Two-step calibration. First the user positions their face against WebGazer's
// live camera box; then they look at each dot and click it, which trains the
// gaze→screen mapping. `visible` is a soft "we can see you" hint; `setPreview`
// shows/hides the camera (hidden during dot-clicking so it can't cover a dot).
export function CalibrationOverlay({
  onPoint,
  onDone,
  onCancel,
  visible,
  setPreview,
}: {
  onPoint: (x: number, y: number) => void;
  onDone: () => void;
  onCancel: () => void;
  visible: boolean;
  setPreview: (show: boolean) => void;
}) {
  const [phase, setPhase] = useState<"aim" | "dots">("aim");
  const [counts, setCounts] = useState<number[]>(() => POINTS.map(() => 0));

  const done = counts.filter((c) => c >= CLICKS_PER_POINT).length;

  // Camera visible while aiming, hidden while clicking dots.
  useEffect(() => {
    setPreview(phase === "aim");
  }, [phase, setPreview]);

  function clickDot(idx: number, e: React.MouseEvent) {
    onPoint(e.clientX, e.clientY);
    setCounts((prev) => {
      const next = [...prev];
      next[idx] = Math.min(CLICKS_PER_POINT, next[idx] + 1);
      if (next.every((c) => c >= CLICKS_PER_POINT)) {
        window.setTimeout(onDone, 150); // let state settle before teardown
      }
      return next;
    });
  }

  if (phase === "aim") {
    return (
      <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/85 px-6 backdrop-blur-sm">
        <div className="max-w-md text-center text-white">
          <p className="font-display text-3xl font-extrabold">
            Set up eye tracking
          </p>
          <p className="mt-3 text-lg text-white/85">
            A camera box appears in the top-left corner. Sit an arm&apos;s length
            away and move so your whole face fills the box.
          </p>
          <p
            className={`mt-4 font-semibold ${visible ? "text-attend" : "text-amber-300"}`}
            role="status"
          >
            {visible
              ? "We can see you. Press Start when your face fills the box."
              : "Looking for your face… turn on your webcam and find good light."}
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              onClick={onCancel}
              className="rounded-full bg-white/15 px-5 py-2.5 font-semibold text-white hover:bg-white/25"
            >
              Cancel
            </button>
            <button
              onClick={() => setPhase("dots")}
              className="rounded-full bg-accent px-8 py-2.5 font-semibold text-white transition-transform hover:scale-[1.03]"
            >
              Start
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] bg-ink/85 backdrop-blur-sm">
      <div className="absolute left-1/2 top-8 -translate-x-1/2 px-6 text-center text-white">
        <p className="font-display text-2xl font-extrabold">
          Look and click each dot
        </p>
        <p className="mt-1 text-white/80">
          Look right at a dot, then click it until it fills. {done}/
          {POINTS.length} done.
        </p>
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            onClick={() => setPhase("aim")}
            className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white hover:bg-white/25"
          >
            Reposition
          </button>
          <button
            onClick={onCancel}
            className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white hover:bg-white/25"
          >
            Cancel
          </button>
        </div>
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
