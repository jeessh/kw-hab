"use client";

import { useEffect, useRef, useState } from "react";

export type SpeechCommandHandlers = {
  onNext?: () => void;
  onBack?: () => void;
  onAdd?: () => void;
  onSettings?: () => void;
};

// The Web Speech API is still vendor-prefixed and untyped in the DOM lib.
type AnyRecognition = any;

function RecognitionCtor(): AnyRecognition | null {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
}

/**
 * Continuous voice-command listener. While `enabled`, it keeps a recognition
 * session open (auto-restarting, since the engine stops itself periodically)
 * and maps spoken keywords to the four card actions. Not supported in Firefox.
 *
 * `paused` gates the mic without tearing down the session — used to stop the
 * recognizer from hearing the text-to-speech bot read the event aloud (which
 * would feed the bot's own words back in as commands).
 */
export function useSpeechCommands(
  enabled: boolean,
  handlers: SpeechCommandHandlers,
  paused = false,
) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [lastHeard, setLastHeard] = useState("");

  // Keep the latest handlers/enabled without re-subscribing the recognizer.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  // The active recognition instance, so the pause effect can start/stop it.
  const recRef = useRef<AnyRecognition>(null);
  // Latched on a permanent error (mic denied, no device) to stop the
  // onend→start→onerror hot-loop. Reset each time `enabled` re-subscribes.
  const hardStopRef = useRef(false);

  useEffect(() => {
    setSupported(!!RecognitionCtor());
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const Ctor = RecognitionCtor();
    if (!Ctor) return;
    hardStopRef.current = false;

    const rec: AnyRecognition = new Ctor();
    recRef.current = rec;
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";

    rec.onstart = () => setListening(true);
    rec.onresult = (e: any) => {
      // Ignore anything captured while muted (that's the TTS bot talking).
      if (pausedRef.current) return;
      const t = String(e.results[e.results.length - 1][0].transcript || "")
        .toLowerCase()
        .trim();
      setLastHeard(t);
      const h = handlersRef.current;
      // "next event" contains "next", so this covers both phrasings.
      if (/\bnext\b/.test(t)) h.onNext?.();
      else if (/\b(back|previous|prev)\b/.test(t)) h.onBack?.();
      else if (/\b(add|attend|register)\b/.test(t)) h.onAdd?.();
      else if (/\bsettings\b/.test(t)) h.onSettings?.();
    };
    rec.onend = () => {
      setListening(false);
      // Auto-restart unless disabled, hard-stopped, or muted for TTS.
      if (enabledRef.current && !hardStopRef.current && !pausedRef.current) {
        try {
          rec.start();
        } catch {
          /* already starting */
        }
      }
    };
    rec.onerror = (e: any) => {
      // Don't auto-restart on persistent failures — that would hot-loop.
      if (
        e?.error === "not-allowed" ||
        e?.error === "service-not-allowed" ||
        e?.error === "audio-capture"
      ) {
        hardStopRef.current = true;
      }
      // Transient errors (e.g. "no-speech") fall through to onend → restart.
    };

    try {
      rec.start();
    } catch {
      /* ignore double-start */
    }

    return () => {
      enabledRef.current = false;
      try {
        rec.onend = null; // prevent auto-restart after teardown
        rec.stop();
      } catch {
        /* ignore */
      }
      recRef.current = null;
      setListening(false);
    };
  }, [enabled]);

  // Mute/unmute the mic when `paused` flips (TTS speaking). Stopping fires
  // onend (which won't restart while paused); unpausing restarts the session.
  useEffect(() => {
    const rec = recRef.current;
    if (!enabled || !rec || hardStopRef.current) return;
    if (paused) {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    } else {
      // Small settle delay so the tail of the spoken audio isn't captured.
      const id = window.setTimeout(() => {
        if (enabledRef.current && !pausedRef.current && !hardStopRef.current) {
          try {
            rec.start();
          } catch {
            /* already running */
          }
        }
      }, 400);
      return () => window.clearTimeout(id);
    }
  }, [paused, enabled]);

  return { supported, listening, lastHeard };
}
