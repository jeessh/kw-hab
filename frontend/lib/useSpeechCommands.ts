"use client";

import { useEffect, useRef, useState } from "react";

export type SpeechCommandHandlers = {
  onNext?: () => void;
  onBack?: () => void;
  onAdd?: () => void;
  onSettings?: () => void;
};

/**
 * What each command sounds like — including what the recognizer mishears it as.
 *
 * The engine is tuned for dictating prose, not for a four-word vocabulary, so
 * it happily returns "text" for "next" and "safe" for "save": real words, high
 * confidence, wrong. Against open dictation that's unfixable, but here the
 * vocabulary is closed and tiny, so the near-misses are enumerable — and a
 * command that needs saying three times is worse than no voice control at all
 * for the people this exists for.
 *
 * Ordered: the first entry whose pattern appears wins, and `next`/`back` come
 * first because they're the ones said most.
 */
const COMMANDS: { key: keyof SpeechCommandHandlers; test: RegExp }[] = [
  // next · necks, nex, text, tex, "next event"
  { key: "onNext", test: /\b(next|necks|nex|text|tex|nixed)\b/ },
  // back · bak, bag, buck, plus the synonyms people reach for
  { key: "onBack", test: /\b(back|bak|bag|buck|previous|prev|last)\b/ },
  // save · safe, save it, "save event"
  { key: "onAdd", test: /\b(save|safe|saved|saves|sav|shave|sale|attend|register|add)\b/ },
  // list · least, lists, "my list"
  { key: "onSettings", test: /\b(list|least|lists|listed|settings)\b/ },
];

/**
 * The command in a phrase, or null.
 *
 * Scans for the LAST match rather than the first: someone correcting themselves
 * says "back — no, next", and the thing they landed on is what they meant.
 */
export function matchCommand(
  transcript: string,
): keyof SpeechCommandHandlers | null {
  const t = transcript.toLowerCase().trim();
  let best: { key: keyof SpeechCommandHandlers; at: number } | null = null;
  for (const { key, test } of COMMANDS) {
    const m = t.match(test);
    if (m && m.index !== undefined && (!best || m.index > best.at)) {
      best = { key, at: m.index };
    }
  }
  return best?.key ?? null;
}

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

// Continuous voice-command listener: maps spoken keywords to the four card
// actions, auto-restarting since the engine stops itself. Not in Firefox.
// `paused` mutes the mic (without tearing down) while TTS speaks, so the
// recognizer doesn't hear the bot and feed its words back as commands.
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
  // The (utterance, command) pair already acted on, so the interim and final
  // results of one word don't fire twice. Null once the utterance closes.
  const handledRef = useRef<string | null>(null);

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
    // Interim results fire while the word is still being said, so a command
    // lands in a couple of hundred milliseconds instead of waiting for the
    // engine to decide the utterance has ended; `handledRef` keeps the interim
    // and the final result of one word from acting twice.
    rec.interimResults = true;
    // The top guess is the most fluent English, not the likeliest command —
    // "next" often loses to "text". Reading the alternatives lets a correct
    // lower-ranked guess win.
    rec.maxAlternatives = 5;
    rec.lang = "en-US";

    rec.onstart = () => setListening(true);
    rec.onresult = (e: any) => {
      // Ignore anything captured while muted (that's the TTS bot talking).
      if (pausedRef.current) return;
      const result = e.results[e.results.length - 1];

      // Every alternative the engine offered for this utterance, best first.
      const alternatives: string[] = [];
      for (let i = 0; i < result.length; i++) {
        const t = String(result[i]?.transcript || "").toLowerCase().trim();
        if (t) alternatives.push(t);
      }
      if (alternatives.length === 0) return;
      setLastHeard(alternatives[0]);

      const key = alternatives.map(matchCommand).find(Boolean);
      if (!key) return;

      // Fire once per (utterance, command) — and let a *different* command
      // through immediately even if the engine reuses the index.
      //
      // This used to latch on resultIndex alone: act once, then refuse until
      // the index changed. Chrome does not reliably advance resultIndex between
      // utterances in a continuous session, so after one command landed the
      // next one was dropped without a trace. Saying "next" and then "save"
      // meant the save never happened and nothing said why.
      //
      // A final result closes the utterance, so repeating the same word — the
      // natural way to page through several programs — works on the next one.
      const signature = `${e.resultIndex}:${key}`;
      if (handledRef.current !== signature) {
        handledRef.current = signature;
        handlersRef.current[key]?.();
      }
      if (result.isFinal) handledRef.current = null;
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
      // Don't auto-restart on persistent failures; that would hot-loop.
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
