"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SpeechCommandHandlers } from "@/lib/useSpeechCommands";

// Reuse the four card actions so gaze, voice, and keys stay in lockstep.
export type EyeTrackingHandlers = SpeechCommandHandlers;

export type GazeZone = "left" | "right" | "up" | "down" | null;
export type DwellStage = "idle" | "arming" | "confirming";

export type GazeState = {
  x: number; // smoothed viewport px
  y: number;
  visible: boolean; // a face/gaze is currently detected
  zone: GazeZone; // which edge the gaze is in (null = neutral center)
  stage: DwellStage; // idle → arming (2s) → confirming (1.5s) → fire
  progress: number; // 0..1 progress within the current stage
};

const ARM_MS = 2000; // hold gaze in a zone this long to "arm" it
const CONFIRM_MS = 1500; // then the ring fills this long to fire
// Fraction of the viewport at each edge that counts as that zone.
const EDGE = 0.16;
// Exponential smoothing factor (0..1): lower = smoother/laggier. Tuned so the
// blob glides without visible jitter but still tracks a deliberate look.
const SMOOTH = 0.22;

const INITIAL: GazeState = {
  x: 0,
  y: 0,
  visible: false,
  zone: null,
  stage: "idle",
  progress: 0,
};

function zoneFor(x: number, y: number, w: number, h: number): GazeZone {
  if (x < w * EDGE) return "left";
  if (x > w * (1 - EDGE)) return "right";
  if (y < h * EDGE) return "up";
  if (y > h * (1 - EDGE)) return "down";
  return null;
}

function browserSupportsEyeTracking(): boolean {
  if (typeof window === "undefined") return false;
  // WebGazer needs getUserMedia (webcam) + a secure context (https/localhost).
  return (
    !!navigator.mediaDevices?.getUserMedia && window.isSecureContext !== false
  );
}

// Gaze navigation via WebGazer (lazy-loaded; the webcam feed stays in the
// browser). Same four handlers as useSpeechCommands. Looking at an edge for 2s
// arms an action, then a 1.5s confirm ring fires it. `paused` freezes dwell.
export function useEyeTracking(
  enabled: boolean,
  handlers: EyeTrackingHandlers,
  paused = false,
) {
  const [supported, setSupported] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gaze, setGaze] = useState<GazeState>(INITIAL);

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Mutable tracking state kept in refs so the rAF/listener loop never restarts.
  const webgazerRef = useRef<any>(null);
  const smoothRef = useRef<{ x: number; y: number } | null>(null);
  const dwellRef = useRef<{ zone: GazeZone; stage: DwellStage; start: number }>(
    { zone: null, stage: "idle", start: 0 },
  );
  // Runs begin()/calibration ONCE per enable; without it StrictMode's remount
  // re-tears-down WebGazer and re-flashes the calibration overlay.
  const startedRef = useRef(false);
  // Deferred-teardown timer, so a StrictMode remount can cancel it first.
  const teardownTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setSupported(browserSupportsEyeTracking());
  }, []);

  // Called on every gaze prediction: smooth, classify the zone, and advance the
  // two-stage dwell timer, firing the handler when confirm completes.
  const onGaze = useCallback((data: { x: number; y: number } | null) => {
    if (!data || pausedRef.current) {
      if (!data) setGaze((g) => ({ ...g, visible: false }));
      return;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Exponential moving average for smooth motion.
    const prev = smoothRef.current ?? { x: data.x, y: data.y };
    const sx = prev.x + (data.x - prev.x) * SMOOTH;
    const sy = prev.y + (data.y - prev.y) * SMOOTH;
    smoothRef.current = { x: sx, y: sy };

    const zone = zoneFor(sx, sy, w, h);
    const now = performance.now();
    const d = dwellRef.current;

    if (zone !== d.zone) {
      // Gaze moved to a new zone (or center) → reset the dwell timer.
      d.zone = zone;
      d.stage = zone ? "arming" : "idle";
      d.start = now;
    } else if (zone) {
      const elapsed = now - d.start;
      if (d.stage === "arming" && elapsed >= ARM_MS) {
        d.stage = "confirming";
        d.start = now;
      } else if (d.stage === "confirming" && elapsed >= CONFIRM_MS) {
        // Fire the action, then reset (require leaving + re-entering to repeat).
        const h2 = handlersRef.current;
        if (zone === "left") h2.onBack?.();
        else if (zone === "right") h2.onNext?.();
        else if (zone === "down") h2.onAdd?.();
        else if (zone === "up") h2.onSettings?.();
        d.zone = null;
        d.stage = "idle";
        d.start = now;
      }
    }

    const span = d.stage === "confirming" ? CONFIRM_MS : ARM_MS;
    const progress =
      d.stage === "idle" ? 0 : Math.min(1, (now - d.start) / span);

    setGaze({
      x: sx,
      y: sy,
      visible: true,
      zone: d.zone,
      stage: d.stage,
      progress,
    });
  }, []);
  // Latest onGaze without making the start effect depend on it (avoids re-flash).
  const onGazeRef = useRef(onGaze);
  onGazeRef.current = onGaze;

  useEffect(() => {
    if (!enabled) return; // disable path → let any deferred teardown fire
    // StrictMode remount before the deferred teardown fired: cancel it and keep
    // the session (a real disable returned above, so its teardown still fires).
    if (teardownTimerRef.current !== null) {
      window.clearTimeout(teardownTimerRef.current);
      teardownTimerRef.current = null;
    }
    if (!browserSupportsEyeTracking()) {
      setError("Eye tracking needs a webcam and a secure (https) connection.");
      return;
    }
    // Already started for this enable: do nothing (stops the re-flash).
    if (startedRef.current) return;
    startedRef.current = true;

    setError(null);
    setCalibrating(true);

    (async () => {
      try {
        // Lazy-load so webgazer's weight never hits users who don't enable it.
        const mod = await import("webgazer");
        const webgazer = (mod as any).default ?? mod;
        // If the user disabled while loading, bail (teardown clears the guard).
        if (!startedRef.current) return;
        webgazerRef.current = webgazer;

        webgazer.showVideoPreview(false);
        webgazer.showPredictionPoints(false); // we render our own cursor
        webgazer.setGazeListener((data: { x: number; y: number } | null) =>
          onGazeRef.current(data),
        );
        await webgazer.begin();
        if (!startedRef.current) {
          try {
            webgazer.end();
          } catch {
            /* ignore */
          }
        }
      } catch {
        if (startedRef.current) {
          setError(
            "Couldn't start eye tracking. Check your webcam permission and " +
              "use Chrome or Edge.",
          );
          setCalibrating(false);
          startedRef.current = false;
        }
      }
    })();

    return () => {
      // Defer teardown a tick: a StrictMode remount clears this timer first, so
      // WebGazer survives and doesn't re-flash. A real disable lets it fire.
      teardownTimerRef.current = window.setTimeout(() => {
        startedRef.current = false;
        const wg = webgazerRef.current;
        webgazerRef.current = null;
        smoothRef.current = null;
        dwellRef.current = { zone: null, stage: "idle", start: 0 };
        setGaze(INITIAL);
        setCalibrating(false);
        if (wg) {
          try {
            wg.clearGazeListener?.();
            wg.end();
          } catch {
            /* ignore */
          }
        }
      }, 0);
    };
  }, [enabled]);

  // Feed a click position to WebGazer's regression training.
  const recordCalibrationPoint = useCallback((x: number, y: number) => {
    const wg = webgazerRef.current;
    try {
      wg?.recordScreenPosition?.(x, y, "click");
    } catch {
      /* ignore */
    }
  }, []);

  const finishCalibration = useCallback(() => setCalibrating(false), []);

  return {
    supported,
    calibrating,
    error,
    gaze,
    recordCalibrationPoint,
    finishCalibration,
  };
}
