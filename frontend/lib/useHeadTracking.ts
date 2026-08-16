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
/** How far the pointer must move before we believe it moved. */
const DEADZONE_PX = 2.5;

/**
 * Hard-stop the webcam.
 *
 * webgazer.end() stops its own loop but does not reliably stop the underlying
 * MediaStreamTracks, so the browser goes on reporting the tab as recording and
 * the camera indicator stays lit. Nothing about that is subtle to a user who
 * just turned the feature off.
 */
function releaseCamera(): void {
  if (typeof document === "undefined") return;
  for (const el of Array.from(document.querySelectorAll("video"))) {
    const stream = el.srcObject as MediaStream | null;
    if (!stream || typeof stream.getTracks !== "function") continue;
    // Only ours — never a video the page itself is playing.
    if (!/webgazer/i.test(el.id) && !/webgazer/i.test(el.className)) continue;
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    }
    el.srcObject = null;
  }
  for (const id of ["webgazerVideoContainer", "webgazerVideoFeed", "webgazerFaceOverlay", "webgazerFaceFeedbackBox"]) {
    document.getElementById(id)?.remove();
  }
}

export function useHeadTracking(
  enabled: boolean,
  handlers: HeadTrackingHandlers,
  paused = false,
) {
  const [supported, setSupported] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<CursorState>(INITIAL);
  // Read inside the frame loop for the deadzone comparison, without making the
  // loop depend on a value that changes every frame.
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  // A face is detected when the tracker has landmark positions.
  const [faceReady, setFaceReady] = useState(false);

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
    const lm = webgazerRef.current?.getTracker?.()?.getPositions?.() ?? null;
    const proxy = lm ? headProxy(lm) : null;
    proxyRef.current = proxy;

    // Pause only applies outside calibration (the overlay opens from the a11y
    // menu, which keeps `paused` true the whole time). Reset dwell on any bail
    // so a hold that was building when a panel opened can't fire on resume.
    if (!proxy || (pausedRef.current && !calibratingRef.current)) {
      dwellRef.current = { zone: null, stage: "idle", start: 0 };
      setCursor((g) =>
        g.visible || g.stage !== "idle"
          ? { ...g, visible: false, zone: null, stage: "idle", progress: 0 }
          : g,
      );
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
    //
    // Tuned much heavier than it was. A head pose estimated per frame from
    // landmarks is noisy, and at minCutoff 0.5 the cursor shook constantly and
    // snapped when it did move — "aggressive and jerky". Lower minCutoff buys
    // stillness at rest; the low beta stops it lurching when someone turns.
    // Extra latency is the price, and it is the right one: this is a pointer
    // for people who cannot use a mouse, so being calm beats being quick.
    if (!filtersRef.current) {
      filtersRef.current = {
        x: new OneEuro({ minCutoff: 0.12, beta: 0.0012 }),
        y: new OneEuro({ minCutoff: 0.12, beta: 0.0012 }),
      };
    }
    const fx = filtersRef.current.x.filter(cx, now);
    const fy = filtersRef.current.y.filter(cy, now);

    // Below this, treat it as the same place. Sub-pixel drift redrawing every
    // frame is what reads as a tremor even when the filter is doing its job.
    const prev = cursorRef.current;
    const sx = Math.abs(fx - prev.x) < DEADZONE_PX ? prev.x : fx;
    const sy = Math.abs(fy - prev.y) < DEADZONE_PX ? prev.y : fy;

    // Freeze dwell during the calibrating→done transition frames (the map
    // exists a beat before calibratingRef flips) so no action can fire early.
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
    // Deferred teardown: a StrictMode remount clears the timer first, so
    // WebGazer survives and doesn't re-flash; a real disable lets it fire. It
    // must be returned from EVERY started path — the remount path included —
    // or that remount registers a no-op cleanup and a later disable would
    // leave the webcam and rAF loop running.
    const scheduleTeardown = () => {
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
        // webgazer.end() leaves the MediaStream open: the tab kept showing
        // "recording" and the camera light stayed on after head tracking was
        // switched off, which for a webcam is not a cosmetic bug. Stop every
        // track ourselves and take the elements out of the DOM.
        releaseCamera();
      }, 0);
    };

    // Already started for this enable (StrictMode remount): keep the session.
    if (startedRef.current) return scheduleTeardown;
    startedRef.current = true;

    // Fresh calibration each enable.
    calibRef.current = new HeadMap();
    mapRef.current = null;
    filtersRef.current = null;
    setError(null);
    setCalibrating(true);

    (async () => {
      try {
        // Lazy-load so webgazer's weight never hits users who don't enable it.
        const mod = await import("webgazer");
        const webgazer = (mod as any).default ?? mod;
        if (!startedRef.current) return;
        webgazerRef.current = webgazer;

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

    return scheduleTeardown;
  }, [enabled]);

  // While enabled, poll the tracker for a detected face (drives the aim hint).
  // A last-resort release. The teardown above handles the normal path, but a
  // hard navigation or a crash in webgazer's own shutdown would otherwise leave
  // the camera light on until the tab closes.
  useEffect(() => {
    if (!enabled) return;
    const onGone = () => releaseCamera();
    window.addEventListener("pagehide", onGone);
    return () => {
      window.removeEventListener("pagehide", onGone);
      releaseCamera();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setFaceReady(false);
      return;
    }
    const id = window.setInterval(() => {
      try {
        const pos = webgazerRef.current?.getTracker?.()?.getPositions?.();
        setFaceReady(Array.isArray(pos) ? pos.length > 0 : !!pos);
      } catch {
        setFaceReady(false);
      }
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
    readProxy,
    recordCalibrationPoint,
    finishCalibration,
    setPreview,
  };
}
