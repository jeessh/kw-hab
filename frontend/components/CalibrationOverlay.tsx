"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { HeadProxy } from "@/lib/headPose";

// 9 points in a 3×3 grid (viewport fractions), ordered top-left → bottom-right.
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

const SAMPLES_PER_POINT = 5; // recordings captured per dot
const SAMPLE_GAP_MS = 60;
const AUTO_HOLD_MS = 1000; // head steady this long → auto-capture the dot
// Head-proxy (yaw/pitch) tolerances: how still counts as "steady", and how far
// the head must move after a capture before the next dot can start arming
// (stops one long hold from capturing several dots with identical poses).
const STEADY_TOL = 0.03;
const MOVE_MIN = 0.07;

const dist = (a: HeadProxy, b: HeadProxy) =>
  Math.hypot(a.yaw - b.yaw, a.pitch - b.pitch);

// Two-step calibration. First position the face against WebGazer's camera box;
// then turn the head toward each yellow dot — holding still for a second
// captures it and advances (Space also captures immediately). `readProxy` feeds
// the hold-still detection; `setPreview` shows/hides the camera (hidden during
// dots so it can't cover one).
export function CalibrationOverlay({
  onPoint,
  onDone,
  onCancel,
  faceReady,
  readProxy,
  setPreview,
}: {
  onPoint: (x: number, y: number) => void;
  onDone: () => void;
  onCancel: () => void;
  faceReady: boolean;
  readProxy: () => HeadProxy | null;
  setPreview: (show: boolean) => void;
}) {
  const [phase, setPhase] = useState<"aim" | "dots">("aim");
  const [current, setCurrent] = useState(0);
  const [holdProgress, setHoldProgress] = useState(0);
  const currentRef = useRef(0);
  currentRef.current = current;
  const busyRef = useRef(false);

  // Camera visible while aiming, hidden while on the dots.
  useEffect(() => {
    setPreview(phase === "aim");
  }, [phase, setPreview]);

  // Capture a burst of samples at the active dot, then advance.
  const capture = useCallback(() => {
    if (busyRef.current) return;
    const idx = currentRef.current;
    if (idx >= POINTS.length) return;
    const [fx, fy] = POINTS[idx];
    const px = fx * window.innerWidth;
    const py = fy * window.innerHeight;
    busyRef.current = true;
    let n = 0;
    const id = window.setInterval(() => {
      onPoint(px, py);
      if (++n >= SAMPLES_PER_POINT) {
        window.clearInterval(id);
        busyRef.current = false;
        const next = currentRef.current + 1;
        setCurrent(next);
        if (next >= POINTS.length) window.setTimeout(onDone, 200);
      }
    }, SAMPLE_GAP_MS);
  }, [onPoint, onDone]);

  // Callback refs: the parent may pass inline callbacks whose identity changes
  // every render. The effects below must depend only on `phase` — if they
  // restarted on each parent render, the hold-still timer would reset before it
  // could ever complete.
  const captureRef = useRef(capture);
  captureRef.current = capture;
  const readProxyRef = useRef(readProxy);
  readProxyRef.current = readProxy;

  // Hold-still auto-capture: while on the dots, a head pose that stays within
  // STEADY_TOL for AUTO_HOLD_MS captures the active dot. After each capture the
  // head must move by MOVE_MIN before the next dot starts arming.
  useEffect(() => {
    if (phase !== "dots") return;
    let anchor: HeadProxy | null = null;
    let since = 0;
    let lastCaptured: HeadProxy | null = null;
    let needMove = false;
    const id = window.setInterval(() => {
      if (busyRef.current || currentRef.current >= POINTS.length) return;
      const p = readProxyRef.current();
      const now = performance.now();
      if (!p) {
        anchor = null;
        setHoldProgress(0);
        return;
      }
      if (needMove) {
        if (lastCaptured && dist(p, lastCaptured) < MOVE_MIN) {
          setHoldProgress(0);
          return;
        }
        needMove = false;
        anchor = p;
        since = now;
      }
      if (!anchor || dist(p, anchor) > STEADY_TOL) {
        anchor = p;
        since = now;
        setHoldProgress(0);
        return;
      }
      const prog = (now - since) / AUTO_HOLD_MS;
      if (prog >= 1) {
        lastCaptured = p;
        needMove = true;
        anchor = null;
        setHoldProgress(0);
        captureRef.current();
      } else {
        setHoldProgress(prog);
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [phase]);

  // Space: begins the dots from the aim screen, or captures immediately.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      e.preventDefault();
      if (e.repeat) return;
      if (phase === "aim") setPhase("dots");
      else captureRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  if (phase === "aim") {
    return (
      <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/85 px-6 backdrop-blur-sm">
        <div className="max-w-md text-center text-white">
          <p className="font-display text-3xl font-extrabold">
            Set up head tracking
          </p>
          <p className="mt-3 text-lg text-white/85">
            A camera box appears in the top-left corner. Sit an arm&apos;s length
            away so your whole face fills it. You&apos;ll steer by turning your head.
          </p>
          <p
            className={`mt-4 font-semibold ${faceReady ? "text-attend" : "text-white/70"}`}
            role="status"
          >
            {faceReady
              ? "Face detected. Press Space to begin."
              : "Line your face up in the box, then press Space. (No box? Allow the camera and refresh.)"}
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
          Turn your head toward the yellow dot and hold still
        </p>
        <p className="mt-1 text-white/80">
          It locks in after a moment. {current} / {POINTS.length} done.
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
        const state = idx < current ? "done" : idx === current ? "active" : "todo";
        const color =
          state === "done" ? "#22C55E" : state === "active" ? "#FACC15" : "#ffffff";
        return (
          <div
            key={idx}
            className="absolute"
            style={{ left: `${fx * 100}%`, top: `${fy * 100}%` }}
          >
            {/* non-animated wrapper centers the dot on the point; the halo scales
                from its own center so it stays aligned with the dot */}
            <div className="-translate-x-1/2 -translate-y-1/2">
              <div
                className="relative grid h-8 w-8 place-items-center rounded-full text-sm font-bold text-ink"
                style={{ background: color, opacity: state === "todo" ? 0.3 : 1 }}
              >
                {state === "active" && (
                  <motion.span
                    className="absolute inset-0 rounded-full"
                    style={{ background: "#FACC15", transformOrigin: "center" }}
                    animate={{ scale: [1, 2.6, 1], opacity: [0.55, 0, 0.55] }}
                    transition={{ duration: 1.3, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
                {/* hold-still progress ring */}
                {state === "active" && holdProgress > 0 && (
                  <svg
                    width={56}
                    height={56}
                    viewBox="0 0 56 56"
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                  >
                    <circle
                      cx="28"
                      cy="28"
                      r={24}
                      fill="none"
                      stroke="#FACC15"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 24}
                      strokeDashoffset={2 * Math.PI * 24 * (1 - holdProgress)}
                      transform="rotate(-90 28 28)"
                    />
                  </svg>
                )}
                <span className="relative">{state === "done" ? "✓" : ""}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
