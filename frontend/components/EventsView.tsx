"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import {
  ApiError,
  api,
  logout,
  updateMe,
  type Event,
  type Me,
  type MePrefs,
} from "@/lib/api";
import { countdown } from "@/lib/time";
import { useHold } from "@/lib/useHold";
import { useTextToSpeech } from "@/lib/useTextToSpeech";
import { useSpeechCommands } from "@/lib/useSpeechCommands";
import { useEyeTracking } from "@/lib/useEyeTracking";
import { GazeCursor } from "@/components/GazeCursor";
import { CalibrationOverlay } from "@/components/CalibrationOverlay";
import { eventToSpeech } from "@/lib/eventSpeech";
import { Modal } from "@/components/Modal";
import { SavedEvents } from "@/components/SavedEvents";

const DROP_THRESHOLD = 150; // drag-down px to save
const SETTINGS_THRESHOLD = 130; // drag-up px to open settings
const HOLD_TOUCH_MS = 2000; // press-and-hold on touch/mouse
const HOLD_KEY_MS = 2000; // keyboard hold (ArrowDown / ArrowUp)
const BERRY = "#E8318A"; // card header + primary accent

// How each side card sits: translate px, scale, opacity, stacking.
const NEIGHBOR: Record<1 | 2, { x: number; scale: number; opacity: number; z: number }> = {
  1: { x: 380, scale: 0.9, opacity: 0.5, z: 20 },
  2: { x: 650, scale: 0.78, opacity: 0.22, z: 10 },
};

// Per-tag icon + colour for the topic stepper. Falls back for unknown tags.
const TAG_STYLE: Record<string, { emoji: string; color: string }> = {
  Food: { emoji: "🍌", color: "#E8318A" },
  Cooking: { emoji: "🍳", color: "#E8318A" },
  Hangout: { emoji: "☕", color: "#22C55E" },
  Coffee: { emoji: "☕", color: "#22C55E" },
  Sports: { emoji: "🏐", color: "#3B82F6" },
  Games: { emoji: "🎮", color: "#3B82F6" },
  Arts: { emoji: "🎨", color: "#F59E0B" },
  Advice: { emoji: "🌱", color: "#2FA36B" },
  Music: { emoji: "🎧", color: "#6366F1" },
  General: { emoji: "🎟️", color: "#5B5BD6" },
};
const tagStyle = (tag: string) =>
  TAG_STYLE[tag] ?? { emoji: "🎟️", color: "#5B5BD6" };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** "July 13, 2026" — the date style used on the card. */
function fullDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function EventsView() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [me, setMe] = useState<Me | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [i, setI] = useState(0);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"loading" | "ready" | "empty">(
    "loading",
  );
  const [view, setView] = useState<"events" | "settings">("events");
  const [confirming, setConfirming] = useState(false);

  const [holdProgress, setHoldProgress] = useState(0);
  const [flying, setFlying] = useState(false);
  const [dropPulse, setDropPulse] = useState(false);
  const [srMessage, setSrMessage] = useState("");

  // Voice-accessibility prefs (hydrated from /users/me, persisted on toggle).
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [eyeEnabled, setEyeEnabled] = useState(false);

  // panels
  const [a11yOpen, setA11yOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);

  const [saveReveal, setSaveReveal] = useState(0);
  const [settingsReveal, setSettingsReveal] = useState(0);

  // Drag transforms (inner card).
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-180, 180], [-9, 9]);
  // Hold-grow / pop / fly transforms (outer wrapper).
  const flyX = useMotionValue(0);
  const flyY = useMotionValue(0);
  const cardScale = useMotionValue(1);
  const cardOpacity = useMotionValue(1);

  const cardWrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null); // fly target: the drop zone

  const holdSave = useHold();
  const holdSettings = useHold();

  const {
    supported: ttsSupported,
    speaking,
    speak,
    cancel: cancelSpeech,
  } = useTextToSpeech();

  // ---- data ----
  useEffect(() => {
    (async () => {
      try {
        const [meRes, evRes] = await Promise.all([
          api<Me>("/users/me"),
          api<Event[]>("/events"),
        ]);
        setMe(meRes);
        setTtsEnabled(meRes.tts_enabled);
        setVoiceEnabled(meRes.voice_commands_enabled);
        setEyeEnabled(meRes.eye_tracking_enabled);
        setEvents(evRes);
        setStatus(evRes.length ? "ready" : "empty");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          router.replace("/signup");
          return;
        }
        setStatus("empty");
      }
    })();
  }, [router]);

  const current = events[i];

  // +1 = advancing (new card slides in from the right), -1 = going back.
  const [dir, setDir] = useState(1);
  const next = useCallback(() => {
    setDir(1);
    setEvents((ev) => (setI((n) => (n + 1) % Math.max(ev.length, 1)), ev));
  }, []);
  const prev = useCallback(() => {
    setDir(-1);
    setEvents(
      (ev) => (setI((n) => (n - 1 + ev.length) % Math.max(ev.length, 1)), ev),
    );
  }, []);

  // Non-wrapping window: the five cards always read left→right in order.
  const slotEvent = useCallback(
    (offset: number): Event | null => {
      const len = events.length;
      if (len === 0) return null;
      // With 5+ events the window wraps so all five slots always show a real
      // card (no blank "missing" gaps); with fewer, out-of-range slots stay blank.
      if (len >= 5) return events[(((i + offset) % len) + len) % len];
      const idx = i + offset;
      return idx >= 0 && idx < len ? events[idx] : null;
    },
    [events, i],
  );

  // Distinct topic tags in first-appearance order.
  const tags = useMemo(() => {
    const first = new Map<string, number>();
    events.forEach((ev, idx) => {
      const t = ev.category || "General";
      if (!first.has(t)) first.set(t, idx);
    });
    return [...first.entries()].map(([tag, index]) => ({ tag, index }));
  }, [events]);

  const attend = useCallback(
    async (ev: Event) => {
      setSrMessage(`Saved ${ev.title}`);
      if (!saved.has(ev.id)) {
        setSaved((prevSaved) => new Set(prevSaved).add(ev.id));
        try {
          await api(`/events/${ev.id}/attend`, { method: "POST" });
        } catch {
          /* keep the optimistic UI even if offline in the demo */
        }
      }
    },
    [saved],
  );

  const saveCurrent = useCallback(async () => {
    const ev = events[i];
    if (!ev) return;
    setConfirming(true);
    void attend(ev);
    window.setTimeout(() => setConfirming(false), 1300);
  }, [events, i, attend]);

  // Voice "attend" → emulate a real drag: ease the card down into the slot
  // (ramping the drop glow with it), pause, then commit like a manual release.
  const dragToAttend = useCallback(async () => {
    const ev = events[i];
    if (!ev || flying) return;
    if (reduceMotion) {
      void saveCurrent();
      return;
    }
    // Drive the slot glow off the card's y-position as it descends.
    const unsub = y.on("change", (v) =>
      setSaveReveal(clamp01(v / DROP_THRESHOLD)),
    );
    await animate(y, DROP_THRESHOLD + 8, {
      type: "spring",
      stiffness: 220,
      damping: 26,
    });
    await new Promise((r) => window.setTimeout(r, 180)); // "release" beat
    unsub();
    setSaveReveal(0);
    await animate(y, 0, { duration: 0.28, ease: "easeOut" });
    void saveCurrent();
  }, [events, i, flying, reduceMotion, y, saveCurrent]);

  // Hold complete → pop the card, shrink it into the bottom-center user icon,
  // register attendance, then slide the next event in from the right.
  const flyToDrop = useCallback(async () => {
    const ev = events[i];
    if (!ev || flying) return;
    setFlying(true);

    const wrap = cardWrapRef.current;
    const target = dropRef.current;

    if (reduceMotion || !wrap || !target) {
      await attend(ev);
      next();
      flyX.set(0);
      flyY.set(0);
      cardScale.set(1);
      cardOpacity.set(1);
      setFlying(false);
      return;
    }

    const card = wrap.getBoundingClientRect();
    const drop = target.getBoundingClientRect();
    const dx = drop.left + drop.width / 2 - (card.left + card.width / 2);
    const dy = drop.top + drop.height / 2 - (card.top + card.height / 2);

    const EASE = [0.4, 0, 0.2, 1] as const;
    await animate(cardScale, 1.09, { duration: 0.12, ease: "easeOut" });
    await Promise.all([
      animate(flyX, dx, { duration: 0.46, ease: EASE }),
      animate(flyY, dy, { duration: 0.46, ease: EASE }),
      animate(cardScale, 0.08, { duration: 0.46, ease: EASE }),
      animate(cardOpacity, 0, { duration: 0.46, ease: "easeIn" }),
    ]);
    setDropPulse(true);
    window.setTimeout(() => setDropPulse(false), 300);

    await attend(ev);
    next();

    flyX.set(120);
    flyY.set(0);
    cardScale.set(1);
    void animate(cardOpacity, 1, { duration: 0.3 });
    await animate(flyX, 0, { type: "spring", stiffness: 260, damping: 26 });
    setFlying(false);
  }, [
    events,
    i,
    flying,
    reduceMotion,
    attend,
    next,
    flyX,
    flyY,
    cardScale,
    cardOpacity,
  ]);

  const openSettings = useCallback(() => {
    setSettingsReveal(1);
    setView("settings");
  }, []);
  const closeSettings = useCallback(() => {
    setSettingsReveal(0);
    setView("events");
  }, []);

  // ---- hold drivers ----
  const startSaveHold = useCallback(
    (ms: number) => {
      if (flying) return;
      holdSave.start(
        ms,
        (p) => {
          setHoldProgress(p);
          cardScale.set(1 + p * 0.06);
        },
        () => {
          setHoldProgress(0);
          void flyToDrop();
        },
      );
    },
    [holdSave, flying, flyToDrop, cardScale],
  );
  const cancelSaveHold = useCallback(() => {
    holdSave.cancel(() => setHoldProgress(0));
    if (!flying) void animate(cardScale, 1, { duration: 0.18 });
  }, [holdSave, flying, cardScale]);

  const startSettingsHold = useCallback(
    (ms: number) => {
      holdSettings.start(
        ms,
        (p) => setSettingsReveal(p),
        () => openSettings(),
      );
    },
    [holdSettings, openSettings],
  );
  const cancelSettingsHold = useCallback(() => {
    holdSettings.cancel(() => setSettingsReveal(0));
  }, [holdSettings]);

  // ---- preferences (persist to profile) ----
  const setPref = useCallback(async (patch: MePrefs) => {
    if (patch.tts_enabled !== undefined) setTtsEnabled(patch.tts_enabled);
    if (patch.voice_commands_enabled !== undefined)
      setVoiceEnabled(patch.voice_commands_enabled);
    if (patch.eye_tracking_enabled !== undefined)
      setEyeEnabled(patch.eye_tracking_enabled);
    setMe((m) => (m ? { ...m, ...patch } : m));
    try {
      await updateMe(patch);
    } catch {
      /* keep optimistic state for the demo even if the write fails */
    }
  }, []);

  const doLogout = useCallback(async () => {
    try {
      await logout();
    } catch {
      /* clear the session client-side regardless */
    }
    router.replace("/signup");
  }, [router]);

  // The four card actions, shared by voice + eye-tracking so every input path
  // behaves identically. (Center gaze / silence = no-op.)
  const actionHandlers = useMemo(
    () => ({
      onNext: () => {
        if (view !== "settings") next();
      },
      onBack: () => (view === "settings" ? closeSettings() : prev()),
      onAdd: () => {
        if (view !== "settings") void dragToAttend();
      },
      onSettings: () =>
        view === "settings" ? closeSettings() : openSettings(),
    }),
    [view, next, prev, dragToAttend, closeSettings, openSettings],
  );

  // ---- voice commands (continuous while enabled) ----
  const { supported: voiceSupported, listening } = useSpeechCommands(
    voiceEnabled,
    actionHandlers,
    // Mute the mic while the TTS bot is reading, so it doesn't hear itself.
    speaking,
  );

  // ---- eye tracking (gaze-dwell while enabled) ----
  const {
    supported: eyeSupported,
    calibrating,
    gaze,
    recordCalibrationPoint,
    finishCalibration,
  } = useEyeTracking(
    eyeEnabled,
    actionHandlers,
    // Freeze dwell while a panel is open so looking around doesn't fire actions.
    view === "settings" || a11yOpen || savedOpen,
  );

  // ---- text-to-speech: read the current event when it changes ----
  useEffect(() => {
    if (ttsEnabled && current && view === "events") {
      speak(eventToSpeech(current));
    } else {
      cancelSpeech();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, current?.id, ttsEnabled, view]);

  // ---- keyboard ----
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (view === "settings") {
        if (e.key === "Escape" || e.key === "ArrowDown") closeSettings();
        return;
      }
      if (flying) return;
      switch (e.key) {
        case "ArrowRight":
          if (!e.repeat) next();
          break;
        case "ArrowLeft":
          if (!e.repeat) prev();
          break;
        case "ArrowDown":
          e.preventDefault();
          if (!e.repeat) startSaveHold(HOLD_KEY_MS);
          break;
        case "ArrowUp":
          e.preventDefault();
          if (!e.repeat) startSettingsHold(HOLD_KEY_MS);
          break;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") cancelSaveHold();
      if (e.key === "ArrowUp") cancelSettingsHold();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [
    view,
    flying,
    next,
    prev,
    startSaveHold,
    cancelSaveHold,
    startSettingsHold,
    cancelSettingsHold,
    closeSettings,
  ]);

  if (status === "loading") {
    return (
      <main className="grid h-dvh place-items-center text-muted">
        <p className="font-display text-2xl">Loading your programs…</p>
      </main>
    );
  }

  const alreadySaved = current ? saved.has(current.id) : false;
  const empty = status === "empty" || !current;

  return (
    <motion.main
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="relative h-dvh w-full select-none overflow-hidden"
    >
      {/* ambient ground */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,#ffffff_0%,#EEEBF5_55%,#E6E1F2_100%)]" />

      {/* eye tracking: gaze cursor + one-time calibration overlay */}
      {eyeEnabled && eyeSupported && <GazeCursor gaze={gaze} />}
      {eyeEnabled && eyeSupported && calibrating && (
        <CalibrationOverlay
          onPoint={recordCalibrationPoint}
          onDone={finishCalibration}
          onCancel={() => void setPref({ eye_tracking_enabled: false })}
        />
      )}

      {/* screen-reader announcement */}
      <p className="sr-only" role="status" aria-live="polite">
        {srMessage}
      </p>

      {/* voice listening indicator */}
      {voiceEnabled && listening && (
        <div
          className="pointer-events-none absolute left-1/2 top-6 z-20 -translate-x-1/2 rounded-full bg-ink/85 px-4 py-1.5 text-sm font-medium text-white"
          role="status"
        >
          🎙 Listening…
        </div>
      )}

      {/* log out — top right, left of the accessibility menu */}
      <button
        onClick={doLogout}
        aria-label="Log out"
        className="absolute right-[4.5rem] top-4 z-50 grid h-12 w-12 place-items-center rounded-full bg-white text-pop shadow-card transition-transform hover:scale-105 focus-visible:scale-105"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <path d="M21 12H9" />
        </svg>
      </button>

      {/* accessibility settings — top right */}
      <AccessibilityMenu
        open={a11yOpen}
        onOpenChange={setA11yOpen}
        ttsEnabled={ttsEnabled}
        voiceEnabled={voiceEnabled}
        ttsSupported={ttsSupported}
        voiceSupported={voiceSupported}
        onToggleTts={(v) => void setPref({ tts_enabled: v })}
        onToggleVoice={(v) => void setPref({ voice_commands_enabled: v })}
        eyeEnabled={eyeEnabled}
        eyeSupported={eyeSupported}
        onToggleEye={(v) => void setPref({ eye_tracking_enabled: v })}
        listening={voiceEnabled && listening}
      />

      {/* large Saved Events panel — opens via the settings gesture */}
      <SavedEvents me={me} reveal={settingsReveal} onClose={closeSettings} />

      {/* ---------------- EVENTS ---------------- */}
      <div
        className="absolute inset-0 flex flex-col items-center px-6 pb-44 pt-8"
        style={{
          opacity: 1 - settingsReveal,
          pointerEvents: view === "settings" ? "none" : "auto",
        }}
      >
        {empty ? (
          <div className="flex flex-1 items-center">
            <p className="font-display text-3xl text-muted">
              No programs yet — check back soon.
            </p>
          </div>
        ) : (
          <>
            {/* category header */}
            <p className="text-sm font-medium text-muted">Category:</p>
            <h1 className="font-display text-4xl font-extrabold text-ink">
              {current.category || "General"}
            </h1>

            {/* tag stepper */}
            <TagStepper
              tags={tags}
              activeTag={current.category || "General"}
              onJump={setI}
            />

            {/* carousel */}
            <div className="relative flex w-full flex-1 items-center justify-center">
              <SideNav side="left" onClick={prev} />
              <SideNav side="right" onClick={next} />

              {[-2, -1, 1, 2].map((off) => (
                <NeighborCard key={off} event={slotEvent(off)} offset={off} />
              ))}

              <motion.div
                ref={cardWrapRef}
                style={{
                  x: flyX,
                  y: flyY,
                  scale: cardScale,
                  opacity: cardOpacity,
                  zIndex: 30,
                }}
                className="relative aspect-[16/9] w-full max-w-[760px]"
              >
                {/* Slide the focused card in from the travel direction on
                    next/back. Enter-only (keyed by id) so it never fights the
                    inner drag x/y or the fly-to-icon transforms. */}
                <motion.div
                  key={current.id}
                  initial={
                    flying || reduceMotion
                      ? false
                      : { x: dir > 0 ? 300 : -300, opacity: 0 }
                  }
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 320, damping: 34 }}
                  className="absolute inset-0"
                >
                <motion.div
                  drag={!flying}
                  dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                  dragElastic={0.65}
                  style={{ x, y, rotate }}
                  whileDrag={{ scale: 1.03 }}
                  onDragStart={() => {
                    cancelSaveHold();
                    cancelSettingsHold();
                  }}
                  onDrag={(_, info) => {
                    const dyy = info.offset.y;
                    if (dyy > 0) {
                      setSaveReveal(clamp01(dyy / DROP_THRESHOLD));
                      setSettingsReveal(0);
                    } else {
                      setSettingsReveal(clamp01(-dyy / SETTINGS_THRESHOLD));
                      setSaveReveal(0);
                    }
                  }}
                  onDragEnd={(_, info) => {
                    const dyy = info.offset.y;
                    setSaveReveal(0);
                    setSettingsReveal(0);
                    if (dyy > DROP_THRESHOLD) void saveCurrent();
                    else if (dyy < -SETTINGS_THRESHOLD) openSettings();
                  }}
                  onPointerDown={() => startSaveHold(HOLD_TOUCH_MS)}
                  onPointerUp={cancelSaveHold}
                  onPointerCancel={cancelSaveHold}
                  className="absolute inset-0 cursor-grab overflow-hidden rounded-[28px] bg-card shadow-card active:cursor-grabbing"
                >
                  <EventCard event={current} saved={alreadySaved} />
                  <HoldBadge progress={holdProgress} />
                  <AnimatePresence>
                    {confirming && <ConfirmSweep />}
                  </AnimatePresence>
                </motion.div>
                </motion.div>
              </motion.div>
            </div>

            {/* hint: the ↓ arrow key saves the focused card */}
            {!flying && !confirming && (
              <motion.div
                aria-hidden
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-2 flex flex-col items-center gap-0.5 text-ink/70"
              >
                <motion.span
                  className="text-2xl leading-none"
                  style={{ color: BERRY }}
                  animate={reduceMotion ? undefined : { y: [0, 5, 0] }}
                  transition={{ repeat: Infinity, duration: 1.2 }}
                >
                  ↓
                </motion.span>
                <span className="text-xs font-semibold">
                  Press ↓ to save
                </span>
              </motion.div>
            )}
          </>
        )}

        {/* drop zone — drag target + hold-to-save fly target */}
        <DropZone ref={dropRef} active={saveReveal > 0 || dropPulse} />
      </div>

      {/* saved events */}
      <button
        onClick={() => setSavedOpen(true)}
        className="absolute bottom-6 right-6 z-30 inline-flex items-center gap-2 rounded-xl border-2 border-edge bg-white px-4 py-3 font-semibold text-ink shadow-card transition-transform hover:scale-[1.02]"
      >
        Saved events
        <BookmarkIcon />
        {saved.size > 0 && (
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1 text-sm text-white">
            {saved.size}
          </span>
        )}
      </button>

      {savedOpen && (
        <SavedEventsModal
          events={events}
          savedIds={saved}
          onClose={() => setSavedOpen(false)}
        />
      )}
    </motion.main>
  );
}

/* ---------------- card ---------------- */

function EventCard({ event, saved }: { event: Event; saved: boolean }) {
  const headerColor = tagStyle(event.category || "General").color;
  return (
    <div className="flex h-full flex-col">
      {/* header tinted by the event's category + braille handle / drag-to-save */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ background: headerColor }}
      >
        <BrailleHandle />
        <span className="flex items-center gap-2 font-semibold text-white">
          {saved ? "Saved ✓" : "Drag to save"}
          <span aria-hidden>↓</span>
        </span>
      </div>

      {/* body: image left, details right */}
      <div className="flex flex-1 gap-5 p-5">
        <div className="relative h-full w-[42%] shrink-0 overflow-hidden rounded-2xl bg-edge">
          {event.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.cover_image_url}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="font-display text-2xl font-extrabold leading-tight text-ink">
            {event.title}
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-ink">
            {fullDate(event.starts_at) && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarIcon /> {fullDate(event.starts_at)}
              </span>
            )}
            {event.location && (
              <span className="inline-flex items-center gap-1.5">
                <PinIcon /> {event.location}
              </span>
            )}
          </div>
          <p className="line-clamp-4 text-sm text-muted">{event.description}</p>
          <p className="mt-auto text-xs font-semibold uppercase tracking-wide text-pop">
            {countdown(event.starts_at)}
            {saved ? " · Saved ✓" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

function BrailleHandle() {
  return (
    <div className="grid grid-cols-3 gap-1" aria-hidden>
      {Array.from({ length: 6 }).map((_, k) => (
        <span key={k} className="h-1.5 w-1.5 rounded-full bg-white/90" />
      ))}
    </div>
  );
}

/* ---------------- neighbours ---------------- */

// Neighbour preview: rough shape only — a category-tinted top bar over a plain
// body rectangle. No image, text, or details (those are for the focused card).
function CardSkeleton({ event }: { event: Event }) {
  const barColor = tagStyle(event.category || "General").color;
  return (
    <div className="flex h-full flex-col" aria-hidden>
      <div className="h-11 w-full" style={{ background: barColor, opacity: 0.65 }} />
      <div className="flex-1 bg-card" />
    </div>
  );
}

function NeighborCard({
  event,
  offset,
}: {
  event: Event | null;
  offset: number;
}) {
  const mag = (Math.abs(offset) === 1 ? 1 : 2) as 1 | 2;
  const cfg = NEIGHBOR[mag];
  const tx = (offset < 0 ? -1 : 1) * cfg.x;
  return (
    <div
      className="pointer-events-none absolute inset-0 grid place-items-center"
      style={{ zIndex: cfg.z }}
      aria-hidden
    >
      <motion.div
        initial={false}
        animate={{ x: tx, scale: cfg.scale, opacity: cfg.opacity }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        style={{ width: "min(86vw, 760px)" }}
        className="aspect-[16/9] overflow-hidden rounded-[28px] shadow-card"
      >
        {event ? (
          <div className="h-full w-full bg-card">
            <CardSkeleton event={event} />
          </div>
        ) : (
          <div className="h-full w-full bg-edge" />
        )}
      </motion.div>
    </div>
  );
}

/* ---------------- stepper ---------------- */

function TagStepper({
  tags,
  activeTag,
  onJump,
}: {
  tags: { tag: string; index: number }[];
  activeTag: string;
  onJump: (i: number) => void;
}) {
  return (
    <div className="relative mt-6 w-full max-w-2xl">
      <div className="absolute left-[8%] right-[8%] top-[24px] h-1 rounded bg-edge" />
      <div
        className="relative flex justify-between"
        role="tablist"
        aria-label="Topics"
      >
        {tags.map(({ tag, index }) => {
          const active = tag === activeTag;
          const { emoji, color } = tagStyle(tag);
          return (
            <button
              key={tag}
              onClick={() => onJump(index)}
              role="tab"
              aria-selected={active}
              aria-label={`${tag}${active ? ", current topic" : ""}`}
              className="relative grid h-12 w-12 place-items-center"
            >
              <span
                className="absolute inset-0 rounded-full border-[3px] bg-white"
                style={{ borderColor: color }}
              />
              {active && (
                <motion.span
                  layoutId="tag-indicator"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-full border-[3px]"
                  style={{ background: color, borderColor: color }}
                />
              )}
              <span
                className="relative z-10 text-xl"
                style={{ transform: active ? "scale(1.1)" : "none" }}
                aria-hidden
              >
                {emoji}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- drop zone ---------------- */

const DropZone = forwardRef<HTMLDivElement, { active: boolean }>(
  function DropZone({ active }, ref) {
    return (
      <div
        ref={ref}
        aria-hidden
        className="absolute bottom-6 left-1/2 flex h-32 w-[min(90vw,520px)] -translate-x-1/2 flex-col items-center justify-center gap-1 rounded-3xl border-2 border-dashed transition-colors"
        style={{
          borderColor: active ? BERRY : "#C9B8D6",
          background: active ? "rgba(232,49,138,0.10)" : "rgba(232,49,138,0.04)",
        }}
      >
        <span className="text-2xl" style={{ color: BERRY }}>
          ↓
        </span>
        <span className="font-display text-lg font-semibold text-ink">
          Drag Events Here!
        </span>
      </div>
    );
  },
);

/* ---------------- accessibility menu ---------------- */

function AccessibilityMenu({
  open,
  onOpenChange,
  ttsEnabled,
  voiceEnabled,
  ttsSupported,
  voiceSupported,
  onToggleTts,
  onToggleVoice,
  eyeEnabled,
  eyeSupported,
  onToggleEye,
  listening,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ttsEnabled: boolean;
  voiceEnabled: boolean;
  ttsSupported: boolean;
  voiceSupported: boolean;
  onToggleTts: (v: boolean) => void;
  onToggleVoice: (v: boolean) => void;
  eyeEnabled: boolean;
  eyeSupported: boolean;
  onToggleEye: (v: boolean) => void;
  listening: boolean;
}) {
  return (
    <div className="absolute right-4 top-4 z-50">
      {open && (
        <button
          aria-hidden
          tabIndex={-1}
          onClick={() => onOpenChange(false)}
          className="fixed inset-0 -z-10 cursor-default"
        />
      )}
      <button
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Accessibility settings"
        className="relative grid h-12 w-12 place-items-center rounded-full bg-white text-accent shadow-card transition-transform hover:scale-105"
      >
        <AccessibilityIcon />
        {listening && (
          <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-attend text-[10px] text-white shadow">
            🎤
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-80 rounded-2xl bg-white p-4 shadow-lift"
        >
          <h2 className="font-display text-lg font-bold text-ink">
            Accessibility
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Turn these on or off any time.
          </p>
          <div className="mt-2 flex flex-col divide-y divide-edge">
            <MenuToggle
              label="Screen reader (read aloud)"
              hint="Speaks each event as you browse."
              checked={ttsEnabled}
              disabled={!ttsSupported}
              disabledHint="Not supported in this browser."
              onChange={onToggleTts}
            />
            <MenuToggle
              label="Speech-to-text (voice control)"
              hint={'Say “next”, “back”, “add”, or “settings”.'}
              checked={voiceEnabled}
              disabled={!voiceSupported}
              disabledHint="Not supported here (try Chrome or Edge)."
              onChange={onToggleVoice}
            />
            <MenuToggle
              label="Eye tracking (gaze control)"
              hint="Look at a screen edge to move, save, or open settings."
              checked={eyeEnabled}
              disabled={!eyeSupported}
              disabledHint="Needs a webcam on Chrome or Edge over https."
              onChange={onToggleEye}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MenuToggle({
  label,
  hint,
  checked,
  disabled,
  disabledHint,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  disabledHint?: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <div>
        <p className="font-semibold text-ink">{label}</p>
        <p className="text-xs text-muted">
          {disabled ? disabledHint ?? hint : hint}
        </p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
          checked ? "bg-accent" : "bg-edge"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

/* ---------------- saved events modal ---------------- */

function SavedEventsModal({
  events,
  savedIds,
  onClose,
}: {
  events: Event[];
  savedIds: Set<string>;
  onClose: () => void;
}) {
  const list = events.filter((e) => savedIds.has(e.id));
  return (
    <Modal title="Saved events" onClose={onClose}>
      {list.length === 0 ? (
        <p className="mt-3 text-lg text-muted">
          No saved events yet. Drag an event down into the drop zone to save it.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {list.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-4 rounded-2xl border-2 border-edge p-3"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-edge">
                {e.cover_image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.cover_image_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{e.title}</p>
                <p className="text-sm text-muted">
                  {fullDate(e.starts_at) || "Date to be announced"}
                  {e.location ? ` · ${e.location}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 flex justify-end">
        <button
          onClick={onClose}
          className="rounded-xl bg-accent px-6 py-3 font-semibold text-white"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}

/* ---------------- hold / confirm ---------------- */

function HoldBadge({ progress }: { progress: number }) {
  if (progress <= 0) return null;
  const r = 40;
  const circ = 2 * Math.PI * r;
  return (
    <div
      className="pointer-events-none absolute inset-0 grid place-items-center"
      aria-hidden
    >
      <div
        className="relative grid h-28 w-28 place-items-center rounded-full"
        style={{ background: "rgba(0,0,0,0.55)" }}
      >
        <svg viewBox="0 0 112 112" className="absolute inset-0 h-full w-full -rotate-90">
          <circle
            cx="56"
            cy="56"
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="8"
          />
          <circle
            cx="56"
            cy="56"
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.92)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - progress)}
          />
        </svg>
        <span className="font-display text-xl font-bold text-white">
          {Math.round(progress * 100)}%
        </span>
      </div>
    </div>
  );
}

function ConfirmSweep() {
  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      className="absolute inset-0 grid place-items-center bg-attend text-white"
    >
      <div className="text-center">
        <div className="text-6xl">✓</div>
        <p className="mt-2 font-display text-3xl font-extrabold">Saved!</p>
        <p className="mt-1 text-lg text-white/80">Added to your saved events.</p>
      </div>
    </motion.div>
  );
}

/* ---------------- side nav ---------------- */

function SideNav({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  return (
    <div
      className={`absolute top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-2 ${
        side === "left" ? "left-2" : "right-2"
      }`}
    >
      <button
        onClick={onClick}
        aria-label={side === "left" ? "Previous program" : "Next program"}
        className="grid h-16 w-16 place-items-center rounded-full border-2 border-edge bg-white text-3xl text-ink shadow-card transition-transform hover:scale-105"
      >
        <span aria-hidden>{side === "left" ? "←" : "→"}</span>
      </button>
      <span className="font-display text-lg font-semibold text-ink">
        {side === "left" ? "Back" : "Next"}
      </span>
    </div>
  );
}

/* ---------------- settings morph ---------------- */

/* ---------------- icons ---------------- */

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 3h12a1 1 0 011 1v17l-7-4-7 4V4a1 1 0 011-1z" />
    </svg>
  );
}

function AccessibilityIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-7 w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="3.8" r="1.6" />
      <path d="M4 8h16M12 8v6M12 14l-3.5 6M12 14l3.5 6" />
    </svg>
  );
}
