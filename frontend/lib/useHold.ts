"use client";
import { useCallback, useMemo, useRef } from "react";

/**
 * Press-and-hold progress driver. `start` animates 0→1 over `duration` ms via
 * rAF, calling onProgress each frame and onComplete once at 1. `cancel` aborts
 * and resets to 0. Used by both touch-hold (2s) and keyboard-hold (1.5s).
 */
export function useHold() {
  const raf = useRef<number | null>(null);

  const cancel = useCallback((onProgress?: (p: number) => void) => {
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    onProgress?.(0);
  }, []);

  const start = useCallback(
    (
      duration: number,
      onProgress: (p: number) => void,
      onComplete: () => void,
    ) => {
      if (raf.current !== null) return; // already holding
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / duration);
        onProgress(p);
        if (p >= 1) {
          raf.current = null;
          onComplete();
          return;
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [],
  );

  // Stable object so consumers can safely list the hook result in deps.
  return useMemo(
    () => ({ start, cancel, holding: () => raf.current !== null }),
    [start, cancel],
  );
}
