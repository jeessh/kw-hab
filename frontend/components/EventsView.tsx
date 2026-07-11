"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { emojiFor } from "@/lib/icons";
import { useHold } from "@/lib/useHold";
import { useTextToSpeech } from "@/lib/useTextToSpeech";
import { useSpeechCommands } from "@/lib/useSpeechCommands";
import { eventToSpeech } from "@/lib/eventSpeech";
import { PersonIcon } from "@/components/PersonIcon";

const DROP_THRESHOLD = 150; // drag-down px to attend
const SETTINGS_THRESHOLD = 130; // drag-up px to open settings
const HOLD_TOUCH_MS = 2000; // press-and-hold on touch/mouse
const HOLD_KEY_MS = 2000; // keyboard hold (ArrowDown / ArrowUp)

// How each side card sits: translate px, scale, opacity, stacking.
const NEIGHBOR: Record<1 | 2, { x: number; scale: number; opacity: number; z: number }> = {
  1: { x: 360, scale: 0.9, opacity: 0.5, z: 20 },
  2: { x: 620, scale: 0.78, opacity: 0.22, z: 10 },
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** "JULY 13, 2026" — the date style used on the card. */
function fullDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d
    .toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();
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

  // Hold-to-attend (press / keyboard) progress, 0..1 → drives the badge + grow.
  const [holdProgress, setHoldProgress] = useState(0);
  // While the card is popping + flying into the user icon.
  const [flying, setFlying] = useState(false);
  const [iconPulse, setIconPulse] = useState(false);
  const [srMessage, setSrMessage] = useState("");

  // Voice-accessibility prefs (hydrated from /users/me, persisted on toggle).
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  // Drag-only progress (keeps the existing "drop here" slot for the drag path).
  const [saveReveal, setSaveReveal] = useState(0);
  const [settingsReveal, setSettingsReveal] = useState(0);

  // Drag transforms (inner card).
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-180, 180], [-9, 9]);
  // Hold-grow / pop / fly transforms (outer wrapper) — kept separate from drag.
  const flyX = useMotionValue(0);
  const flyY = useMotionValue(0);
  const cardScale = useMotionValue(1);
  const cardOpacity = useMotionValue(1);

  const cardWrapRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);

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

  // Which event sits `offset` slots from the focused one. The window does NOT
  // wrap, so the five cards always read left→right in the events' own order
  // (never scrambled); out-of-range slots render as a blank grey card.
  const slotEvent = useCallback(
    (offset: number): Event | null => {
      const idx = i + offset;
      return idx >= 0 && idx < events.length ? events[idx] : null;
    },
    [events, i],
  );

  // Distinct topic tags in first-appearance order (several events can share a
  // tag). Drives the stepper circles + the current-position indicator.
  const tags = useMemo(() => {
    const first = new Map<string, number>();
    events.forEach((ev, idx) => {
      const t = ev.category || "General";
      if (!first.has(t)) first.set(t, idx);
    });
    return [...first.entries()].map(([tag, index]) => ({ tag, index }));
  }, [events]);

  // Register attendance (optimistic) without any confirm-sweep UI — used by the
  // hold path, whose feedback IS the fly-into-icon animation.
  const attend = useCallback(
    async (ev: Event) => {
      setSrMessage(`Attending ${ev.title}`);
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

  // Drag-release-to-attend keeps its slot + confirm sweep (unchanged path).
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
  const flyToIcon = useCallback(async () => {
    const ev = events[i];
    if (!ev || flying) return;
    setFlying(true);

    const wrap = cardWrapRef.current;
    const iconEl = iconRef.current;

    if (reduceMotion || !wrap || !iconEl) {
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
    const icon = iconEl.getBoundingClientRect();
    const dx = icon.left + icon.width / 2 - (card.left + card.width / 2);
    const dy = icon.top + icon.height / 2 - (card.top + card.height / 2);

    const EASE = [0.4, 0, 0.2, 1] as const;
    await animate(cardScale, 1.09, { duration: 0.12, ease: "easeOut" });
    await Promise.all([
      animate(flyX, dx, { duration: 0.46, ease: EASE }),
      animate(flyY, dy, { duration: 0.46, ease: EASE }),
      animate(cardScale, 0.05, { duration: 0.46, ease: EASE }),
      animate(cardOpacity, 0, { duration: 0.46, ease: "easeIn" }),
    ]);
    setIconPulse(true);
    window.setTimeout(() => setIconPulse(false), 280);

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
          cardScale.set(1 + p * 0.06); // card grows as the ring fills
        },
        () => {
          setHoldProgress(0);
          void flyToIcon();
        },
      );
    },
    [holdSave, flying, flyToIcon, cardScale],
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

  // ---- voice commands (continuous while enabled) ----
  const { supported: voiceSupported, listening } = useSpeechCommands(
    voiceEnabled,
    {
      // next/add only act on the visible card — ignore them while Settings is
      // open (back/settings stay live so voice can close the panel).
      onNext: () => {
        if (view !== "settings") next();
      },
      onBack: () => (view === "settings" ? closeSettings() : prev()),
      onAdd: () => {
        if (view !== "settings") void dragToAttend();
      },
      onSettings: () => (view === "settings" ? closeSettings() : openSettings()),
    },
    // Mute the mic while the TTS bot is reading, so it doesn't hear itself.
    speaking,
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

      {/* screen-reader announcement for attend actions */}
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

      {/* ---------------- SETTINGS MORPH ---------------- */}
      <SettingsMorph
        me={me}
        reveal={settingsReveal}
        onClose={closeSettings}
        ttsEnabled={ttsEnabled}
        voiceEnabled={voiceEnabled}
        ttsSupported={ttsSupported}
        voiceSupported={voiceSupported}
        onToggleTts={(v) => void setPref({ tts_enabled: v })}
        onToggleVoice={(v) => void setPref({ voice_commands_enabled: v })}
        onLogout={doLogout}
      />

      {/* ---------------- EVENTS ---------------- */}
      <div
        className="absolute inset-0 flex flex-col items-center px-6 pb-28 pt-8"
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
            {/* main tag of the focused event */}
            <h1 className="text-center font-display text-3xl font-extrabold text-ink">
              {current.category || "General"}
            </h1>

            {/* tag stepper — one circle per topic, indicator slides to current */}
            <TagStepper
              tags={tags}
              activeTag={current.category || "General"}
              onJump={setI}
            />

            {/* carousel: 5 slots, center is interactive, sides fade + overlap */}
            <div className="relative flex w-full flex-1 items-center justify-center">
              {/* side nav */}
              <SideNav side="left" onClick={prev} />
              <SideNav side="right" onClick={next} />

              {/* faded neighbours (blank grey when there aren't enough events) */}
              {[-2, -1, 1, 2].map((off) => (
                <NeighborCard key={off} event={slotEvent(off)} offset={off} />
              ))}

              {/* hold-grow / pop / fly wrapper for the focused card */}
              <motion.div
                ref={cardWrapRef}
                style={{
                  x: flyX,
                  y: flyY,
                  scale: cardScale,
                  opacity: cardOpacity,
                  zIndex: 30,
                }}
                className="relative aspect-[3/2] w-full max-w-[720px]"
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
                  whileDrag={{ scale: 1.04 }}
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
          </>
        )}

        {/* drag-to-attend target */}
        <SaveSlot reveal={saveReveal} />

        {/* bottom bar — name · you · your 3 sign-in icons */}
        {me && (
          <div
            className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-4"
            style={{ opacity: 1 - saveReveal }}
          >
            <span className="font-display text-lg text-ink">
              {me.first_name} {me.last_name}
            </span>
            <motion.button
              ref={iconRef}
              onClick={openSettings}
              aria-label="Open your settings"
              animate={iconPulse ? { scale: [1, 1.35, 1] } : { scale: 1 }}
              transition={{ duration: 0.28 }}
              className="grid h-14 w-14 place-items-center rounded-full bg-white shadow-card transition-transform hover:scale-105"
            >
              <PersonIcon className="h-7 w-7 text-accent" />
            </motion.button>
            <div
              className="flex items-center gap-1.5"
              role="img"
              aria-label={`Your sign-in icons: ${me.icons.join(", ")}`}
            >
              {me.icons.map((slug, idx) => (
                <span
                  key={`${slug}-${idx}`}
                  aria-hidden
                  className="grid h-9 w-9 place-items-center rounded-xl bg-white text-xl shadow-card"
                >
                  {emojiFor(slug)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.main>
  );
}

/* ---------------- pieces ---------------- */

function EventCard({ event, saved }: { event: Event; saved: boolean }) {
  return (
    <div className="flex h-full flex-col p-5">
      {/* image — the large area up top */}
      <div className="relative w-full flex-1 overflow-hidden rounded-2xl bg-edge">
        {event.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.cover_image_url}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        )}
        {saved && (
          <span className="absolute right-3 top-3 rounded-full bg-attend px-3 py-1 text-sm font-semibold text-white">
            Attending ✓
          </span>
        )}
      </div>

      {/* body — title + description on the left, countdown + date on the right */}
      <div className="mt-4 flex items-start justify-between gap-5">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-extrabold leading-tight text-ink">
            {event.title}
          </h2>
          <p className="mt-1 line-clamp-3 text-sm text-muted">
            {event.description}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-sm font-bold uppercase tracking-wide text-ink">
            {countdown(event.starts_at)}
          </p>
          {fullDate(event.starts_at) && (
            <p className="mt-0.5 text-xs font-medium text-muted">
              {fullDate(event.starts_at)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Background cards keep the card's shape and image but replace all text with
 * grey bars, so a side event reads as a card without competing for attention.
 */
function CardSkeleton({ event }: { event: Event }) {
  return (
    <div className="flex h-full flex-col p-5" aria-hidden>
      {/* image — same large area as the real card */}
      <div className="relative w-full flex-1 overflow-hidden rounded-2xl bg-edge">
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

      {/* body — grey bars where the title / description / date would be */}
      <div className="mt-4 flex items-start justify-between gap-5">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-5 w-2/3 rounded bg-edge" />
          <div className="h-3 w-full rounded bg-edge" />
          <div className="h-3 w-5/6 rounded bg-edge" />
          <div className="h-3 w-1/2 rounded bg-edge" />
        </div>
        <div className="shrink-0 space-y-2">
          <div className="ml-auto h-3.5 w-16 rounded bg-edge" />
          <div className="ml-auto h-3 w-20 rounded bg-edge" />
        </div>
      </div>
    </div>
  );
}

/** A faded, non-interactive side card — or a blank grey slot when null. */
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
        style={{ width: "min(86vw, 720px)" }}
        className="aspect-[3/2] overflow-hidden rounded-[28px] shadow-card"
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

/**
 * Topic stepper: one circle per distinct tag. A single accent indicator slides
 * smoothly to the tag the focused event belongs to (shared-layout animation),
 * so it reads as a continuous position marker even with multiple events per tag.
 */
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
    <div className="relative mt-5 w-full max-w-2xl">
      {/* connecting line, sitting behind the nodes at their centre */}
      <div className="absolute left-[8%] right-[8%] top-[18px] h-1 rounded bg-edge" />
      <div
        className="relative flex justify-between"
        role="tablist"
        aria-label="Topics"
      >
        {tags.map(({ tag, index }) => {
          const active = tag === activeTag;
          return (
            <button
              key={tag}
              onClick={() => onJump(index)}
              role="tab"
              aria-selected={active}
              aria-label={`${tag}${active ? ", current topic" : ""}`}
              className="flex max-w-[7rem] flex-col items-center gap-1.5"
            >
              <span className="relative grid h-9 w-9 place-items-center rounded-full border-2 border-edge bg-white shadow-card">
                {active && (
                  <motion.span
                    layoutId="tag-indicator"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-[-2px] rounded-full border-2 border-accent bg-accent"
                  />
                )}
              </span>
              <span
                className={`truncate text-xs transition-colors ${
                  active ? "font-semibold text-ink" : "text-muted"
                }`}
              >
                {tag}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SaveSlot({ reveal }: { reveal: number }) {
  // Full-width bottom glow that rises up the screen and intensifies as the
  // member nears confirmation. Height grows from ~18vh to ~55vh of the viewport.
  const heightVh = 18 + reveal * 37;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center"
      style={{ opacity: clamp01(reveal * 1.15) }}
    >
      <div
        className="flex w-full flex-col items-center justify-end pb-8"
        style={{
          height: `${heightVh}vh`,
          background: `radial-gradient(140% 100% at 50% 130%, rgba(255,122,77,${
            0.28 + reveal * 0.4
          }), rgba(255,122,77,0) 72%)`,
        }}
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ repeat: Infinity, duration: 1.1 }}
          style={{ scale: 0.7 + reveal * 0.7 }}
          className="text-4xl text-pop"
        >
          ↑
        </motion.div>
        <p className="font-display text-lg font-semibold text-ink">
          {reveal > 0.9 ? "Release to attend" : "Drop here to attend"}
        </p>
      </div>
    </div>
  );
}

/**
 * Centered hold indicator: a translucent-black disc with a translucent-white
 * arc that fills clockwise from the top as the hold progresses 0→1.
 */
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
        <p className="mt-2 font-display text-3xl font-extrabold">
          You&apos;re attending!
        </p>
        <p className="mt-1 text-lg text-white/80">You&apos;re all registered.</p>
      </div>
    </motion.div>
  );
}

function SideNav({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={side === "left" ? "Previous program" : "Next program"}
      className={`absolute top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-1 text-accent ${
        side === "left" ? "left-2" : "right-2"
      }`}
    >
      <span aria-hidden className="text-5xl font-black leading-none">
        {side === "left" ? "‹" : "›"}
      </span>
      <span className="text-xs font-medium text-muted">
        {side === "left" ? "Left arrow" : "Right arrow"}
      </span>
    </button>
  );
}

function SettingsMorph({
  me,
  reveal,
  onClose,
  ttsEnabled,
  voiceEnabled,
  ttsSupported,
  voiceSupported,
  onToggleTts,
  onToggleVoice,
  onLogout,
}: {
  me: Me | null;
  reveal: number;
  onClose: () => void;
  ttsEnabled: boolean;
  voiceEnabled: boolean;
  ttsSupported: boolean;
  voiceSupported: boolean;
  onToggleTts: (v: boolean) => void;
  onToggleVoice: (v: boolean) => void;
  onLogout: () => void;
}) {
  if (reveal <= 0) return null;
  return (
    <div
      className="absolute inset-0 z-10 grid place-items-center overflow-y-auto py-10"
      style={{ opacity: reveal }}
      onClick={onClose}
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="grid place-items-center rounded-full bg-white shadow-lift"
          style={{ height: 96 + reveal * 96, width: 96 + reveal * 96 }}
        >
          <PersonIcon
            className="text-accent"
            style={{ height: 44 + reveal * 40, width: 44 + reveal * 40 }}
          />
        </div>
        {me && (
          <p className="font-display text-3xl font-extrabold text-ink">
            {me.first_name} {me.last_name}
          </p>
        )}

        {reveal > 0.95 && (
          // stopPropagation: the backdrop closes on click, the card must not.
          <div
            className="mt-2 w-[min(440px,86vw)] rounded-3xl bg-white p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-xl font-extrabold text-ink">
              Voice &amp; accessibility
            </h2>

            <ToggleRow
              label="Read events aloud"
              hint="Speaks each event as you browse."
              checked={ttsEnabled}
              disabled={!ttsSupported}
              disabledHint="Not supported in this browser."
              onChange={onToggleTts}
            />
            <ToggleRow
              label="Voice commands"
              hint={'Say "next", "back", "add", or "settings".'}
              checked={voiceEnabled}
              disabled={!voiceSupported}
              disabledHint="Not supported in this browser (try Chrome or Edge)."
              onChange={onToggleVoice}
            />

            {voiceEnabled && voiceSupported && (
              <p className="mt-3 text-sm text-muted">
                Listening uses your microphone; audio may be sent to your
                browser’s speech service for recognition.
              </p>
            )}

            <button
              onClick={onLogout}
              className="mt-6 w-full rounded-xl border-2 border-edge px-5 py-3 font-semibold text-pop transition-colors hover:border-pop"
            >
              Log out
            </button>
            <p className="mt-4 text-center text-sm text-muted">
              Tap outside to go back
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
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
    <div className="mt-4 flex items-start justify-between gap-4">
      <div>
        <p className="font-display text-lg font-semibold text-ink">{label}</p>
        <p className="text-sm text-muted">
          {disabled ? disabledHint ?? hint : hint}
        </p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
          checked ? "bg-accent" : "bg-edge"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}
