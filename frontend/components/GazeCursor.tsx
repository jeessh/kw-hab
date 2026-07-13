"use client";

import { motion } from "framer-motion";
import type { GazeState } from "@/lib/useEyeTracking";

const ACCENT = "#5B5BD6";
const CONFIRM = "#E8318A";

const ZONE_LABEL: Record<string, string> = {
  left: "← Back",
  right: "Next →",
  up: "↑ Settings",
  down: "↓ Save",
};

// Glowing blob at the smoothed gaze point; grows and draws a ring while a
// dwell arms/confirms, and glows the matching edge for the pending action.
export function GazeCursor({ gaze }: { gaze: GazeState }) {
  if (!gaze.visible) return null;

  const active = gaze.stage !== "idle" && gaze.zone;
  const confirming = gaze.stage === "confirming";
  const ringColor = confirming ? CONFIRM : ACCENT;

  const r = 46;
  const circ = 2 * Math.PI * r;

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]" aria-hidden>
      {/* edge glow for the armed/confirming zone */}
      {active && <EdgeGlow zone={gaze.zone!} color={ringColor} />}

      {/* the blob + ring, positioned at the smoothed gaze point */}
      <motion.div
        className="absolute"
        style={{ left: 0, top: 0 }}
        animate={{ x: gaze.x, y: gaze.y }}
        transition={{ type: "tween", ease: "linear", duration: 0.08 }}
      >
        <div className="relative -translate-x-1/2 -translate-y-1/2">
          {/* soft glowing blob */}
          <div
            className="rounded-full"
            style={{
              width: active ? 68 : 44,
              height: active ? 68 : 44,
              background: `radial-gradient(circle, ${ringColor}cc 0%, ${ringColor}55 45%, ${ringColor}00 72%)`,
              filter: "blur(2px)",
              transition: "width 180ms ease, height 180ms ease",
            }}
          />
          {/* radial progress ring during dwell */}
          {active && (
            <svg
              width={120}
              height={120}
              viewBox="0 0 120 120"
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            >
              <circle
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke={`${ringColor}33`}
                strokeWidth="6"
              />
              <circle
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke={ringColor}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - gaze.progress)}
                transform="rotate(-90 60 60)"
              />
            </svg>
          )}
        </div>
      </motion.div>

      {/* label of the pending action */}
      {active && (
        <div
          className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full px-4 py-1.5 text-sm font-semibold text-white shadow-lg"
          style={{ background: ringColor }}
        >
          {confirming ? "Confirming… " : "Hold… "}
          {ZONE_LABEL[gaze.zone!]}
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
