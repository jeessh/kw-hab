"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SpeechCommandHandlers } from "@/lib/useSpeechCommands";
import { OneEuro } from "@/lib/oneEuro";
import { HeadMap, headProxy, type HeadProxy } from "@/lib/headPose";

// Reuse the four card actions so head, voice, and keys stay in lockstep.
export type HeadTrackingHandlers = SpeechCommandHandlers;

export type CursorZone = "left" | "right" | "up" | "down" | null;
export type DwellStage = "idle" | "arming";

export type CursorState = {
  x: number; // smoothed viewport px
  y: number;
  visible: boolean; // a face is tracked and calibration is done
  zone: CursorZone; // which edge the cursor is in (null = neutral center)
  stage: DwellStage; // idle → arming (fills over 1.5s) → fire
  progress: number; // 0..1 progress within the current stage
};

const DWELL_MS = 1500; // hover a zone this long to fire the action
// Fraction of the viewport at each edge that counts as that zone.
const EDGE = 0.16;

const INITIAL: CursorState = {
  x: 0,
  y: 0,
  visible: false,
  zone: null,
  stage: "idle",
  progress: 0,
};

function zoneFor(x: number, y: number, w: number, h: number): CursorZone {
  if (x < w * EDGE) return "left";
  if (x > w * (1 - EDGE)) return "right";
  if (y < h * EDGE) return "up";
  if (y > h * (1 - EDGE)) return "down";
  return null;
}

function browserSupportsHeadTracking(): boolean {
  if (typeof window === "undefined") return false;
  // WebGazer needs getUserMedia (webcam) + a secure context (https/localhost).
  return (
    !!navigator.mediaDevices?.getUserMedia && window.isSecureContext !== false
  );
}

// Head-pointing navigation. WebGazer (lazy-loaded) runs the mediapipe facemesh;
// we ignore its gaze estimate and drive the cursor from head orientation
// (far steadier). Same four handlers as useSpeechCommands: point the head at an
// edge and hold ~1.5s to fire. `paused` freezes dwell.
export function useHeadTracking(
  enabled: boolean,
  handlers: HeadTrackingHandlers,
  paused = false,
) {
  const [supported, setSupported] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<CursorState>(INITIAL);
  // A face is detected when the tracker has landmark positions.
  const [faceReady, setFaceReady] = useState(false);
  // TEMP diagnostics: localize where the pipeline stalls.
  const [debug, setDebug] = useState<{
    faceCount: number;
    frames: number;
    proxy: HeadProxy | null;
    samples: number;
    calibrated: boolean;
  }>({ faceCount: 0, frames: 0, proxy: null, samples: 0, calibrated: false });
  const frameRef = useRef(0);
  const sampleCountRef = useRef(0);

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const calibratingRef = useRef(calibrating);
  calibratingRef.current = calibrating;

  // Mutable tracking state kept in refs so the loop never restarts.
  const webgazerRef = useRef<any>(null);
  const filtersRef = useRef<{ x: OneEuro; y: OneEuro } | null>(null);
  const dwellRef = useRef<{ zone: CursorZone; stage: DwellStage; start: number }>(
    { zone: null, stage: "idle", start: 0 },
  );
  const proxyRef = useRef<HeadProxy | null>(null); // latest head orientation
  const mapRef = useRef<HeadMap | null>(null); // fitted proxy→screen map
  const calibRef = useRef<HeadMap | null>(null); // samples being collected
  const rafRef = useRef<number | null>(null);
  // Runs begin()/calibration ONCE per enable; without it StrictMode's remount
  // re-tears-down WebGazer and re-flashes the calibration overlay.
  const startedRef = useRef(false);
  // Deferred-teardown timer, so a StrictMode remount can cancel it first.
  const teardownTimerRef = useRef<number | null>(null);
  // The overlay's desired camera-preview state. setPreview writes it even before
  // WebGazer is ready; begin() applies it once the instance exists.
  const previewWantedRef = useRef(true);

  useEffect(() => {
    setSupported(browserSupportsHeadTracking());
  }, []);

  // One frame: read landmarks → head proxy → (if calibrated) map to screen,
  // smooth, classify the zone, and advance the dwell timer.
  const tick = useCallback(() => {
    frameRef.current += 1;
    const lm = webgazerRef.current?.getTracker?.()?.getPositions?.() ?? null;
    const proxy = lm ? headProxy(lm) : null;
    proxyRef.current = proxy;

    if (!proxy || pausedRef.current) {
      if (!proxy) setCursor((g) => (g.visible ? { ...g, visible: false } : g));
      return;
    }

    // Before calibration there's no map, so we can't place the cursor — we're
    // only capturing proxies (recordCalibrationPoint reads proxyRef).
    const map = mapRef.current;
    if (!map) {
      setCursor((g) => (g.visible ? { ...g, visible: false } : g));
      return;
    }

    const screen = map.predict(proxy.yaw, proxy.pitch);
    if (!screen) return;

    const now = performance.now();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = Math.max(0, Math.min(w, screen.x));
    const cy = Math.max(0, Math.min(h, screen.y));

    // Adaptive smoothing (one-euro): steady at rest, responsive on real moves.
    if (!filtersRef.current) {
      filtersRef.current = {
        x: new OneEuro({ minCutoff: 0.5, beta: 0.004 }),
        y: new OneEuro({ minCutoff: 0.5, beta: 0.004 }),
      };
    }
    const sx = filtersRef.current.x.filter(cx, now);
    const sy = filtersRef.current.y.filter(cy, now);

    // While calibrating, show the cursor but freeze dwell so drifting to an edge
    // can't fire next/prev/add underneath the overlay.
    if (calibratingRef.current) {
      dwellRef.current = { zone: null, stage: "idle", start: 0 };
      setCursor({ x: sx, y: sy, visible: true, zone: null, stage: "idle", progress: 0 });
      return;
    }

    const zone = zoneFor(sx, sy, w, h);
    const d = dwellRef.current;

    if (zone !== d.zone) {
      d.zone = zone;
      d.stage = zone ? "arming" : "idle";
      d.start = now;
    } else if (zone && now - d.start >= DWELL_MS) {
      // Held long enough → fire, then reset (leave + re-enter to repeat).
      const h2 = handlersRef.current;
      if (zone === "left") h2.onBack?.();
      else if (zone === "right") h2.onNext?.();
      else if (zone === "down") h2.onAdd?.();
      else if (zone === "up") h2.onSettings?.();
      d.zone = null;
      d.stage = "idle";
      d.start = now;
    }

    const progress = d.stage === "idle" ? 0 : Math.min(1, (now - d.start) / DWELL_MS);

    setCursor({ x: sx, y: sy, visible: true, zone: d.zone, stage: d.stage, progress });
  }, []);
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    if (!enabled) return; // disable path → let any deferred teardown fire
    // StrictMode remount before the deferred teardown fired: cancel it and keep
    // the session (a real disable returned above, so its teardown still fires).
    if (teardownTimerRef.current !== null) {
      window.clearTimeout(teardownTimerRef.current);
      teardownTimerRef.current = null;
    }
    if (!browserSupportsHeadTracking()) {
      setError("Head tracking needs a webcam and a secure (https) connection.");
      return;
    }
    // Already started for this enable: do nothing (stops the re-flash).
    if (startedRef.current) return;
    startedRef.current = true;

    // Fresh calibration each enable.
    calibRef.current = new HeadMap();
    mapRef.current = null;
    filtersRef.current = null;
    sampleCountRef.current = 0;
    frameRef.current = 0;
    setError(null);
    setCalibrating(true);

    (async () => {
      try {
        // Lazy-load so webgazer's weight never hits users who don't enable it.
        const mod = await import("webgazer");
        const webgazer = (mod as any).default ?? mod;
        if (!startedRef.current) return;
        webgazerRef.current = webgazer;
        console.log("[head] webgazer loaded; starting facemesh…");

        // The mediapipe facemesh assets are served from /public (node_modules
        // isn't on the web path); point WebGazer at that absolute path, else the
        // model 404s and no face is ever detected.
        webgazer.params.faceMeshSolutionPath = "/mediapipe/face_mesh";
        webgazer.showPredictionPoints(false);
        webgazer.setGazeListener(() => {}); // we read landmarks ourselves
        await webgazer.begin();
        if (!startedRef.current) {
          try {
            webgazer.end();
          } catch {
            /* ignore */
          }
          return;
        }
        webgazer.showVideoPreview(previewWantedRef.current);
        console.log("[head] begin() resolved — head tracking live");

        // Drive our own per-frame loop off the facemesh landmarks.
        const loop = () => {
          if (!startedRef.current) return;
          tickRef.current();
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (e) {
        console.error("[head] init failed:", e);
        if (startedRef.current) {
          setError(
            "Couldn't start head tracking. Check your webcam permission and " +
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
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        const wg = webgazerRef.current;
        webgazerRef.current = null;
        filtersRef.current = null;
        dwellRef.current = { zone: null, stage: "idle", start: 0 };
        setCursor(INITIAL);
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

  // While enabled, poll the tracker for a detected face + gather diagnostics.
  useEffect(() => {
    if (!enabled) {
      setFaceReady(false);
      return;
    }
    const id = window.setInterval(() => {
      let faceCount = 0;
      try {
        const pos = webgazerRef.current?.getTracker?.()?.getPositions?.();
        faceCount = Array.isArray(pos) ? pos.length : pos ? 1 : 0;
      } catch {
        /* ignore */
      }
      setFaceReady(faceCount > 0);
      setDebug({
        faceCount,
        frames: frameRef.current,
        proxy: proxyRef.current,
        samples: sampleCountRef.current,
        calibrated: !!mapRef.current,
      });
    }, 300);
    return () => window.clearInterval(id);
  }, [enabled]);

  // Live head orientation, for the overlay's hold-still auto-capture.
  const readProxy = useCallback(() => proxyRef.current, []);

  // Capture the current head orientation paired with a calibration dot.
  const recordCalibrationPoint = useCallback((x: number, y: number) => {
    const proxy = proxyRef.current;
    if (!proxy || !calibRef.current) return;
    calibRef.current.add(proxy.yaw, proxy.pitch, x, y);
    sampleCountRef.current += 1;
  }, []);

  // Toggle the camera preview (the overlay hides it while pointing at dots so it
  // can't sit on top of a calibration point).
  const setPreview = useCallback((show: boolean) => {
    previewWantedRef.current = show;
    try {
      webgazerRef.current?.showVideoPreview(show);
    } catch {
      /* ignore */
    }
  }, []);

  const finishCalibration = useCallback(() => {
    const ok = calibRef.current?.fit() ?? false;
    if (ok) {
      mapRef.current = calibRef.current;
    } else {
      setError("Calibration didn't take. Turn your head toward each dot and retry.");
    }
    filtersRef.current = null; // fresh smoothing with the new map
    setPreview(false); // hide the camera so it doesn't cover cards
    setCalibrating(false);
  }, [setPreview]);

  return {
    supported,
    calibrating,
    error,
    cursor,
    faceReady,
    debug,
    readProxy,
    recordCalibrationPoint,
    finishCalibration,
    setPreview,
  };
}
