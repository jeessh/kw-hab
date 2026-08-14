"use client";

import {
  forwardRef,
  memo,
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
import { useHeadTracking } from "@/lib/useHeadTracking";
import { HeadCursor } from "@/components/HeadCursor";
import { CalibrationOverlay } from "@/components/CalibrationOverlay";
import { eventToSpeech } from "@/lib/eventSpeech";
import { SavedEvents } from "@/components/SavedEvents";
import { CATEGORIES } from "@/lib/categories";
import { personalizedFeed } from "@/lib/feed";
import {
  bucketsFor,
  dimensionByKey,
  type DimensionKey,
} from "@/lib/dimensions";
import {
  AccountChip,
  SeeEventsBy,
  ViewToggle,
  type ViewMode,
} from "@/components/member/MemberChrome";
import { LoginOverlay } from "@/components/member/LoginOverlay";
import { EventDetailModal } from "@/components/member/EventDetailModal";
import {
  GridFeed,
  SavedEventsButton,
  SearchBox,
} from "@/components/member/GridFeed";
import { RegisterPrompt } from "@/components/member/RegisterPrompt";
import {
  BucketStepper,
  SaveZone,
  WideEventCard,
} from "@/components/member/FeedParts";

const DROP_THRESHOLD = 150; // drag-down px to save
const SETTINGS_THRESHOLD = 130; // drag-up px to open settings
const HOLD_TOUCH_MS = 2000; // press-and-hold on touch/mouse
const HOLD_KEY_MS = 1000; // keyboard hold (ArrowUp / ArrowDown)
const NAV_HOVER_MS = 1500; // hover-dwell on a side zone to move
const NAV_PRESS_MS = 500; // press-and-hold a side zone to move (also covers touch)
const NAV_PEEK = 96; // px the whole carousel slides while a side dwell builds
const BERRY = "#E8318A"; // card header + primary accent
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// Card date format, e.g. "July 13, 2026".
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

export function EventsView({
  initialMe,
  eventsPromise,
  attendedPromise,
}: {
  /** Null when nobody is signed in — browsing is open, saving is not. */
  initialMe: Me | null;
  eventsPromise: Promise<Event[]>;
  attendedPromise: Promise<Event[]>;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [me, setMe] = useState<Me | null>(initialMe);
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

  // Voice-accessibility prefs (seeded from initialMe, persisted on toggle).
  // A signed-out visitor still gets every accessibility mode; they just live
  // for the session instead of on a profile. Withholding them until someone has
  // an account would gate the app on the barrier it exists to remove.
  const [ttsEnabled, setTtsEnabled] = useState(
    initialMe?.tts_enabled ?? false,
  );
  const [voiceEnabled, setVoiceEnabled] = useState(
    initialMe?.voice_commands_enabled ?? false,
  );
  const [headEnabled, setHeadEnabled] = useState(
    initialMe?.eye_tracking_enabled ?? false,
  );
  const signedIn = me !== null;

  // panels
  const [a11yOpen, setA11yOpen] = useState(false);
  // One card at a time, or the grid. The grid is a placeholder layout.
  const [viewMode, setViewMode] = useState<ViewMode>("carousel");
  // How the feed is grouped for the stepper — the "See events by" choice.
  const [dimensionKey, setDimensionKey] = useState<DimensionKey>("org");
  const [dimOpen, setDimOpen] = useState(false);
  // The program someone was looking at when they were asked to sign in, and
  // the one to offer registration for once they have.
  const [authFor, setAuthFor] = useState<Event | null>(null);
  const [registerFor, setRegisterFor] = useState<Event | null>(null);
  // Open with no pending program — someone signing in of their own accord
  // rather than because they tried to save something.
  const [authOpen, setAuthOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [detailFor, setDetailFor] = useState<Event | null>(null);

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
  // Whole-carousel horizontal shift while a side-zone dwell builds (the "peek").
  const peekX = useMotionValue(0);

  const cardWrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null); // fly target: the drop zone
  const peekSideRef = useRef<"left" | "right" | null>(null);

  // Which side zone is currently dwelling + how far along (0→1), for its UI.
  const [peekSide, setPeekSide] = useState<"left" | "right" | null>(null);
  const [navProgress, setNavProgress] = useState(0);

  const holdSave = useHold();
  const holdSettings = useHold();
  const holdNav = useHold();

  const {
    supported: ttsSupported,
    speaking,
    speak,
    cancel: cancelSpeech,
  } = useTextToSpeech();

  // Consume the route's parallel prefetch; if it failed (e.g. a blip during the
  // auth check), fetch fresh now that we've mounted past the gate.
  useEffect(() => {
    let alive = true;
    eventsPromise
      .catch(() => api<Event[]>("/events"))
      .then((evRes) => {
        if (!alive) return;
        setEvents(evRes);
        setStatus(evRes.length ? "ready" : "empty");
      })
      .catch(() => {
        if (alive) setStatus("empty");
      });
    return () => {
      alive = false;
    };
  }, [eventsPromise]);

  // Seed `saved` with the server's attended events so the card badge, count,
  // and saved state survive a reload. Merge with anything saved this session;
  // a failure is non-fatal (leave `saved` as-is).
  useEffect(() => {
    let alive = true;
    // No .catch fallback: the route resolves this to [] rather than rejecting,
    // because signed-out is a normal outcome here, not a failure to retry.
    attendedPromise
      .then((attended) => {
        if (!alive) return;
        setSaved((prevSaved) => {
          const merged = new Set(prevSaved);
          attended.forEach((ev) => merged.add(ev.id));
          return merged;
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [attendedPromise]);

  // The feed the member actually browses: their filters applied, then ordered
  // by how well each program matches their interests. Nothing is hidden by
  // personalization — best matches simply come first.
  //
  // Keyed on the two profile arrays rather than `me`: setPref rebuilds `me` on
  // every preference write, so depending on the whole object would re-sort (and
  // hand the memoized stepper a new array) every time someone toggled, say,
  // text-to-speech — which has no bearing on order.
  const interests = me?.interest_categories;
  const accessPrefs = me?.accessibility_prefs;
  const feed = useMemo(() => {
    // A program that already happened is not a thing anyone can attend, and
    // the design's "Today / Tomorrow" headings assume it's gone. Undated
    // programs stay — "date to be announced" is still upcoming.
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const upcoming = events.filter(
      (ev) => !ev.starts_at || new Date(ev.starts_at) >= todayStart,
    );
    return personalizedFeed(upcoming, {
      interests: interests ?? [],
      accessPrefs: accessPrefs ?? [],
    });
  }, [events, interests, accessPrefs]);

  // A filter change can shorten the feed out from under the cursor.
  useEffect(() => {
    setI((n) => (n < feed.length ? n : 0));
  }, [feed.length]);

  const current = feed[i];

  // +1 = advancing (new card slides in from the right), -1 = going back.
  const [dir, setDir] = useState(1);
  // Wrapping needs the live length, but next/prev must keep a stable identity
  // (they feed the memoized side zones and the voice/head action handlers).
  const feedLenRef = useRef(feed.length);
  feedLenRef.current = feed.length;
  const next = useCallback(() => {
    setDir(1);
    setI((n) => (n + 1) % Math.max(feedLenRef.current, 1));
  }, []);
  const prev = useCallback(() => {
    setDir(-1);
    setI(
      (n) =>
        (n - 1 + feedLenRef.current) % Math.max(feedLenRef.current, 1),
    );
  }, []);

  // Non-wrapping window: the five cards always read left→right in order.

  // Buckets of the chosen dimension, in the order they appear in the feed.
  const dimension = useMemo(
    () => dimensionByKey(dimensionKey),
    [dimensionKey],
  );
  const buckets = useMemo(
    () => bucketsFor(feed, dimension),
    [feed, dimension],
  );
  // Which bucket the current card belongs to — what the stepper highlights and
  // what the label under the dropdown names.
  const activeBucket = current
    ? dimension.bucket(current)
    : { id: "", label: "", color: "#8A8AA0" };


  // Read `saved` through a ref so `attend` (and everything built on it) keeps
  // a stable identity across saves.
  const savedRef = useRef(saved);
  savedRef.current = saved;
  // Latest profile, for handlers that must stay identity-stable.
  const meRef = useRef(me);
  meRef.current = me;
  // Read through a ref so `attend` keeps a stable identity for the memoized
  // gesture handlers.
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;

  // Sign in over the feed rather than navigating away: the program stays on
  // screen behind the overlay, so there is nothing to find again afterwards.
  const toSignIn = useCallback((ev: Event) => {
    setAuthFor(ev);
    setAuthOpen(true);
  }, []);

  // Re-read the profile so the feed, the saved list and the chrome all agree
  // that somebody is here now.
  const handleSignedIn = useCallback(async () => {
    setAuthOpen(false);
    const pending = authFor;
    setAuthFor(null);
    try {
      setMe(await api<Me>("/users/me"));
    } catch {
      /* the cookie is set; the next read will pick the profile up */
    }
    if (pending) setRegisterFor(pending);
  }, [authFor]);

  const attend = useCallback(
    async (ev: Event) => {
      if (savedRef.current.has(ev.id)) return;
      if (!signedInRef.current) {
        toSignIn(ev);
        return;
      }
      setSrMessage(`Saved ${ev.title}`);
      setSaved((prevSaved) => new Set(prevSaved).add(ev.id));
      try {
        await api(`/events/${ev.id}/attend`, { method: "POST" });
      } catch (e) {
        // Roll the badge back on any failure, including an expired session.
        // Leaving it would tell someone a program is saved when the server has
        // no record of it — they find out by turning up to nothing, or by
        // reloading and watching it vanish.
        setSaved((prevSaved) => {
          const next = new Set(prevSaved);
          next.delete(ev.id);
          return next;
        });
        // Signed in a moment ago, not any more: the cookie expired mid-request.
        if (e instanceof ApiError && e.status === 401) {
          toSignIn(ev);
          return;
        }
        setSrMessage(`Could not save ${ev.title}. Please try again.`);
      }
    },
    [toSignIn],
  );

  const unsave = useCallback(async (ev: Event) => {
    setSaved((prevSaved) => {
      const next = new Set(prevSaved);
      next.delete(ev.id);
      return next;
    });
    setSrMessage(`Removed ${ev.title}`);
    try {
      await api(`/events/${ev.id}/attend`, { method: "DELETE" });
    } catch {
      // Put it back rather than show it gone when it isn't.
      setSaved((prevSaved) => new Set(prevSaved).add(ev.id));
      setSrMessage(`Could not remove ${ev.title}.`);
    }
  }, []);

  const toggleSave = useCallback(
    (ev: Event) => {
      if (savedRef.current.has(ev.id)) void unsave(ev);
      else void attend(ev);
    },
    [attend, unsave],
  );

  // Counting the click before leaving; losing the count must never cost the
  // member the link.
  const openRegistration = useCallback((ev: Event) => {
    if (!ev.registration_url) return;
    window.open(ev.registration_url, "_blank", "noopener,noreferrer");
    void api(`/events/${ev.id}/registration-click`, { method: "POST" }).catch(
      () => {},
    );
  }, []);

  const saveCurrent = useCallback(async () => {
    const ev = feed[i];
    if (!ev) return;
    setConfirming(true);
    void attend(ev);
    window.setTimeout(() => setConfirming(false), 1300);
  }, [feed, i, attend]);

  // Voice "attend": ease the card into the slot (ramping the glow), then commit.
  const dragToAttend = useCallback(async () => {
    const ev = feed[i];
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
  }, [feed, i, flying, reduceMotion, y, saveCurrent]);
  // Stable identity for the memoized DropZone (dragToAttend changes on every
  // card navigation, which would defeat its memo).
  const dragToAttendRef = useRef(dragToAttend);
  dragToAttendRef.current = dragToAttend;
  const saveFromButton = useCallback(() => {
    void dragToAttendRef.current();
  }, []);

  // Hold complete: pop the card, shrink it into the drop zone, attend, advance.
  const flyToDrop = useCallback(async () => {
    const ev = feed[i];
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
    feed,
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

  // ---- side-zone navigation (hover-dwell or press-and-hold) ----
  // A dwell can outlive state changes, so its guard reads live refs (not values
  // closed over at start) or auto-repeat would keep firing in the background.
  const flyingRef = useRef(flying);
  flyingRef.current = flying;
  const viewRef = useRef(view);
  viewRef.current = view;
  const navBlocked = () => flyingRef.current || viewRef.current === "settings";
  // True once a press-dwell commits a move, so the click that fires on release
  // of that same press doesn't navigate a second time.
  const navFiredRef = useRef(false);

  // Dwelling a side zone slides the carousel; when the timer fills it moves a
  // card and, while the pointer stays, repeats so you can browse continuously.
  const runNav = useCallback(
    (side: "left" | "right", ms: number) => {
      if (navBlocked()) return;
      peekSideRef.current = side;
      setPeekSide(side);
      const sign = side === "left" ? 1 : -1; // left → slide right, right → slide left
      holdNav.start(
        ms,
        (p) => {
          peekX.set(sign * p * NAV_PEEK);
          setNavProgress(p);
        },
        () => {
          peekX.set(0);
          setNavProgress(0);
          // Bail if state flipped mid-dwell (Settings opened / card flying).
          if (navBlocked()) {
            peekSideRef.current = null;
            setPeekSide(null);
            return;
          }
          // Only press-holds get the click guard: their release fires a click.
          if (ms === NAV_PRESS_MS) navFiredRef.current = true;
          if (side === "left") prev();
          else next();
          if (peekSideRef.current === side) runNav(side, ms);
        },
      );
    },
    [holdNav, peekX, prev, next],
  );

  // Restart the dwell with a new duration (hover ↔ press) from a clean state.
  const startNav = useCallback(
    (side: "left" | "right", ms: number) => {
      holdNav.cancel();
      runNav(side, ms);
    },
    [holdNav, runNav],
  );

  // Click = navigate immediately (skipping the dwell), unless this click is the
  // release of a press-dwell that already committed.
  const clickNav = useCallback(
    (side: "left" | "right") => {
      if (navFiredRef.current) {
        navFiredRef.current = false;
        return;
      }
      if (navBlocked()) return;
      if (side === "left") prev();
      else next();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prev, next],
  );

  // Pointer left / released the zone before completing → smoothly slide back.
  const resetNav = useCallback(() => {
    peekSideRef.current = null;
    holdNav.cancel();
    setPeekSide(null);
    setNavProgress(0);
    void animate(peekX, 0, { type: "spring", stiffness: 300, damping: 30 });
  }, [holdNav, peekX]);

  // Stable per-side handlers so the memoized SideZones don't re-render on
  // every state change. Hover-dwell also restarts on release of a press.
  const hoverNavLeft = useCallback(
    () => startNav("left", NAV_HOVER_MS),
    [startNav],
  );
  const pressNavLeft = useCallback(() => {
    navFiredRef.current = false;
    startNav("left", NAV_PRESS_MS);
  }, [startNav]);
  const clickNavLeft = useCallback(() => clickNav("left"), [clickNav]);
  const hoverNavRight = useCallback(
    () => startNav("right", NAV_HOVER_MS),
    [startNav],
  );
  const pressNavRight = useCallback(() => {
    navFiredRef.current = false;
    startNav("right", NAV_PRESS_MS);
  }, [startNav]);
  const clickNavRight = useCallback(() => clickNav("right"), [clickNav]);

  // ---- preferences (persist to profile) ----
  const setPref = useCallback(async (patch: MePrefs) => {
    if (patch.tts_enabled !== undefined) setTtsEnabled(patch.tts_enabled);
    if (patch.voice_commands_enabled !== undefined)
      setVoiceEnabled(patch.voice_commands_enabled);
    if (patch.eye_tracking_enabled !== undefined)
      setHeadEnabled(patch.eye_tracking_enabled);
    setMe((m) => (m ? { ...m, ...patch } : m));
    try {
      await updateMe(patch);
    } catch {
      /* keep optimistic state for the demo even if the write fails */
    }
  }, []);

  const toggleTts = useCallback(
    (v: boolean) => void setPref({ tts_enabled: v }),
    [setPref],
  );
  const toggleVoice = useCallback(
    (v: boolean) => void setPref({ voice_commands_enabled: v }),
    [setPref],
  );
  const toggleHead = useCallback(
    (v: boolean) => void setPref({ eye_tracking_enabled: v }),
    [setPref],
  );

  // Adding or removing a topic re-scores the feed immediately (setPref merges
  // into `me`, which `feed` derives from) and persists via PATCH /users/me.
  // Reads through a ref so the handler keeps a stable identity for the memoized
  // menu, and so the toggle isn't a side effect inside a state updater.
  //
  // Re-scoring reorders the feed under the cursor, so `i` has to move with it.
  // Left alone, the member would silently land on whichever unrelated program
  // happened to fall at their old index — and the read-aloud voice would start
  // describing it. Going to the top is the one predictable answer: they just
  // said what they want to see first, so show them that, and say so.
  const toggleInterest = useCallback(
    (label: string) => {
      const chosen = meRef.current?.interest_categories ?? [];
      const adding = !chosen.includes(label);
      void setPref({
        interest_categories: adding
          ? [...chosen, label]
          : chosen.filter((c) => c !== label),
      });
      setI(0);
      setSrMessage(
        adding
          ? `Added ${label}. Showing your best matches from the start.`
          : `Removed ${label}. Showing your best matches from the start.`,
      );
    },
    [setPref],
  );

  const doLogout = useCallback(async () => {
    try {
      await logout();
    } catch {
      /* clear the session client-side regardless */
    }
    router.replace("/");
  }, [router]);

  // The four card actions, shared by voice + head-tracking for identical behavior.
  // Voice and head-tracking both drive these. In the grid there is no focused
  // card, so next/back/add would move and save something invisible — the head
  // cursor would fill and a program nobody had looked at would be saved. Only
  // opening the saved list still makes sense there.
  const cardActionsLive = view !== "settings" && viewMode === "carousel";
  const actionHandlers = useMemo(
    () => ({
      onNext: () => {
        if (cardActionsLive) next();
      },
      onBack: () =>
        view === "settings" ? closeSettings() : cardActionsLive && prev(),
      onAdd: () => {
        if (cardActionsLive) void dragToAttend();
      },
      onSettings: () =>
        view === "settings" ? closeSettings() : openSettings(),
    }),
    [
      view,
      cardActionsLive,
      next,
      prev,
      dragToAttend,
      closeSettings,
      openSettings,
    ],
  );

  // ---- voice commands (continuous while enabled) ----
  const { supported: voiceSupported, listening } = useSpeechCommands(
    voiceEnabled,
    actionHandlers,
    // Mute the mic while the TTS bot is reading, so it doesn't hear itself.
    speaking,
  );

  // ---- head tracking (cursor-dwell while enabled) ----
  const {
    supported: headSupported,
    calibrating,
    cursor,
    faceReady,
    error: headError,
    readProxy,
    recordCalibrationPoint,
    finishCalibration,
    setPreview,
  } = useHeadTracking(
    headEnabled,
    actionHandlers,
    // Freeze dwell while a panel is open so looking around doesn't fire actions.
    view === "settings" || a11yOpen,
  );

  // ---- text-to-speech: read the current event when it changes ----
  useEffect(() => {
    // Nothing to read in the grid: there is no "current card" on screen, so
    // reading one aloud describes something the listener can't find.
    if (ttsEnabled && current && view === "events" && viewMode === "carousel") {
      speak(eventToSpeech(current));
    } else {
      cancelSpeech();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, current?.id, ttsEnabled, view, viewMode]);

  // ---- keyboard ----
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (view === "settings") {
        if (e.key === "Escape" || e.key === "ArrowDown") closeSettings();
        return;
      }
      // Don't steal arrows from whatever the person is actually using. A
      // select, a text field or an open menu owns its own arrow keys; swallowing
      // them here made the organization picker unusable and, worse, started a
      // hold-to-save the member could neither see nor cancel.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) ||
          target.isContentEditable ||
          target.closest('[role="menu"]'))
      ) {
        return;
      }
      // The grid has no focused card, so the card actions have nothing to act
      // on. Firing them anyway saved programs nobody had seen.
      if (viewMode !== "carousel") return;
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
      <div className="pointer-events-none absolute inset-0 bg-white" />

      {/* head tracking: cursor + one-time calibration overlay */}
      {headEnabled && headSupported && <HeadCursor cursor={cursor} />}
      {headEnabled && headSupported && calibrating && (
        <CalibrationOverlay
          onPoint={recordCalibrationPoint}
          onDone={() => {
            finishCalibration();
            // Close the accessibility menu so dwell (paused while it's open)
            // starts working the moment tracking goes live.
            setA11yOpen(false);
          }}
          onCancel={() => void setPref({ eye_tracking_enabled: false })}
          faceReady={faceReady}
          readProxy={readProxy}
          setPreview={setPreview}
        />
      )}

      {/* head tracking active indicator — stable text; the dot shows live status
          (green = we see you) so intermittent detection doesn't spam readers */}
      {headEnabled && headSupported && !calibrating && (
        <div className="pointer-events-none absolute left-4 top-4 z-40 inline-flex items-center gap-2 rounded-full bg-ink/85 px-3 py-1.5 text-sm font-medium text-white">
          <span
            className={`h-2 w-2 rounded-full ${cursor.visible ? "bg-attend" : "bg-white/40"}`}
          />
          🧭 Head tracking on
        </div>
      )}

      {headEnabled && headError && (
        <div
          role="alert"
          className="pointer-events-none absolute left-4 top-16 z-40 max-w-xs rounded-xl bg-pop px-3 py-2 text-sm font-medium text-white"
        >
          {headError}
        </div>
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

      {/* View toggle, top left. */}
      <div className="absolute left-4 top-4 z-50">
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </div>

      {/* Who you are, top right. Signed out it is the way in. */}
      <div className="absolute right-4 top-4 z-50">
        <AccountChip
          name={me ? `${me.first_name} ${me.last_name.charAt(0)}.` : null}
          onClick={() => (signedIn ? void doLogout() : setAuthOpen(true))}
        />
      </div>

      {/* accessibility settings */}
      <AccessibilityMenu
        open={a11yOpen}
        onOpenChange={setA11yOpen}
        ttsEnabled={ttsEnabled}
        voiceEnabled={voiceEnabled}
        ttsSupported={ttsSupported}
        voiceSupported={voiceSupported}
        onToggleTts={toggleTts}
        onToggleVoice={toggleVoice}
        headEnabled={headEnabled}
        headSupported={headSupported}
        onToggleHead={toggleHead}
        listening={voiceEnabled && listening}
        interests={me?.interest_categories ?? []}
        onToggleInterest={toggleInterest}
        signedIn={signedIn}
        onSignIn={() => {
          setAuthFor(null);
          setAuthOpen(true);
        }}
      />

      {/* Saved Events panel (opens via the settings gesture) */}
      <SavedEvents
        me={me}
        reveal={settingsReveal}
        onClose={closeSettings}
        onSignIn={() => {
          setAuthFor(null);
          setAuthOpen(true);
        }}
      />

      {/* ---------------- EVENTS ---------------- */}
      <div
        className={`absolute inset-0 flex flex-col items-center px-6 pt-8 ${
          viewMode === "grid" ? "pb-8" : "pb-44"
        }`}
        style={{
          opacity: 1 - settingsReveal,
          pointerEvents: view === "settings" ? "none" : "auto",
        }}
      >
        {/* No filter bar: the design doesn't have one. Cost and organization
            are two of the six ways to group instead, which is the design's
            answer to the same need. */}

        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            <p className="font-display text-3xl text-muted">
              No programs yet. Check back soon.
            </p>
          </div>
        ) : (
          <>
            {viewMode === "grid" ? (
              <div className="flex w-full max-w-6xl flex-wrap items-start justify-between gap-4 pb-6">
                <SeeEventsBy
                  dimension={dimension}
                  open={dimOpen}
                  onOpenChange={setDimOpen}
                  onSelect={(key) => setDimensionKey(key)}
                  align="left"
                />
                <div className="flex flex-col items-end gap-4">
                  <SearchBox value={query} onChange={setQuery} />
                  <SavedEventsButton
                    count={saved.size}
                    onClick={openSettings}
                  />
                </div>
              </div>
            ) : (
              <>
                <SeeEventsBy
                  dimension={dimension}
                  open={dimOpen}
                  onOpenChange={setDimOpen}
                  onSelect={(key) => {
                    setDimensionKey(key);
                    setI(0);
                    setSrMessage(
                      `Showing events by ${dimensionByKey(key).heading}.`,
                    );
                  }}
                />
                <p className="mt-3 font-display text-xl font-semibold text-ink">
                  {activeBucket.label}
                </p>
                <BucketStepper
                  buckets={buckets}
                  activeId={activeBucket.id}
                  onJump={setI}
                />
              </>
            )}

            {viewMode === "grid" ? (
              <GridFeed
                events={feed}
                saved={saved}
                query={query}
                onOpen={setDetailFor}
                onToggleSave={toggleSave}
              />
            ) : (
            /* carousel */
            <div className="relative flex w-full flex-1 items-center justify-center">
              <SideZone
                side="left"
                progress={peekSide === "left" ? navProgress : 0}
                active={peekSide === "left"}
                disabled={flying}
                onEnter={hoverNavLeft}
                onDown={pressNavLeft}
                onUp={hoverNavLeft}
                onClick={clickNavLeft}
                onLeave={resetNav}
              />
              <SideZone
                side="right"
                progress={peekSide === "right" ? navProgress : 0}
                active={peekSide === "right"}
                disabled={flying}
                onEnter={hoverNavRight}
                onDown={pressNavRight}
                onUp={hoverNavRight}
                onClick={clickNavRight}
                onLeave={resetNav}
              />

              {/* Peek group: neighbours + focused card slide together on a dwell.
                  Sits above the side zones but is pointer-events-none so its
                  transparent flanks pass hover through; the card re-enables events. */}
              <motion.div
                style={{ x: peekX }}
                className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
              >
                <motion.div
                  ref={cardWrapRef}
                  style={{
                    x: flyX,
                    y: flyY,
                    scale: cardScale,
                    opacity: cardOpacity,
                    zIndex: 30,
                  }}
                  className="pointer-events-auto relative aspect-[2.3/1] w-full max-w-[880px]"
                >
                {/* Focused card slides in from the travel direction on next/back.
                    Enter-only (keyed by id) so it won't fight the drag/fly transforms. */}
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
                    resetNav();
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
                  className="absolute inset-0 cursor-grab overflow-hidden rounded-[28px] border-[1.5px] border-[#9A9A9A] bg-white active:cursor-grabbing"
                >
                  <WideEventCard event={current} saved={alreadySaved} />
                  <HoldBadge progress={holdProgress} />
                  <AnimatePresence>
                    {confirming && <ConfirmSweep />}
                  </AnimatePresence>
                </motion.div>
                </motion.div>
              </motion.div>
              </motion.div>
            </div>
            )}
          </>
        )}

        {/* Drop target for drag + hold-to-save, and the saved count. */}
        {viewMode === "carousel" && (
          <SaveZone
            ref={dropRef}
            active={saveReveal > 0 || dropPulse}
            count={saved.size}
            onSave={saveFromButton}
            onOpen={openSettings}
          />
        )}
      </div>

      {authOpen && (
        <LoginOverlay
          onClose={() => {
            setAuthOpen(false);
            setAuthFor(null);
          }}
          onSignedIn={() => void handleSignedIn()}
          onSignUp={() => router.push("/signup")}
        />
      )}

      {detailFor && (
        <EventDetailModal
          event={detailFor}
          saved={saved.has(detailFor.id)}
          onClose={() => setDetailFor(null)}
          onSave={(ev) => {
            setDetailFor(null);
            void attend(ev);
          }}
          onOpenRegistration={openRegistration}
        />
      )}

      {registerFor && (
        <RegisterPrompt
          title={registerFor.title}
          onSkip={() => setRegisterFor(null)}
          onRegister={() => {
            const ev = registerFor;
            setRegisterFor(null);
            void attend(ev);
          }}
        />
      )}
    </motion.main>
  );
}

/* ---------------- accessibility menu ---------------- */

const AccessibilityMenu = memo(function AccessibilityMenu({
  open,
  onOpenChange,
  ttsEnabled,
  voiceEnabled,
  ttsSupported,
  voiceSupported,
  onToggleTts,
  onToggleVoice,
  headEnabled,
  headSupported,
  onToggleHead,
  listening,
  interests,
  onToggleInterest,
  signedIn,
  onSignIn,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ttsEnabled: boolean;
  voiceEnabled: boolean;
  ttsSupported: boolean;
  voiceSupported: boolean;
  onToggleTts: (v: boolean) => void;
  onToggleVoice: (v: boolean) => void;
  headEnabled: boolean;
  headSupported: boolean;
  onToggleHead: (v: boolean) => void;
  listening: boolean;
  interests: string[];
  onToggleInterest: (label: string) => void;
  signedIn: boolean;
  onSignIn: () => void;
}) {
  return (
    // Sits under the view toggle, top left, as in the design.
    <div className="absolute left-4 top-[4.75rem] z-50">
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
        aria-label="Your settings: interests and accessibility"
        className="relative inline-flex items-center gap-1 rounded-full py-1 pl-1 pr-2 text-ink transition-transform hover:scale-105"
      >
        <AccessibilityIcon />
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {listening && (
          <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-attend text-[10px] text-white shadow">
            🎤
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 mt-2 max-h-[80vh] w-80 overflow-y-auto rounded-2xl bg-white p-4 shadow-lift"
        >
          <h2 className="font-display text-lg font-bold text-ink">
            What you like
          </h2>
          {/* Topics live on a profile, so there is nowhere to put them without
              an account. The accessibility switches below need no account and
              stay available either way. */}
          {!signedIn ? (
            <button
              onClick={onSignIn}
              className="mt-3 w-full rounded-2xl bg-accent px-6 py-3 text-lg font-semibold text-white"
            >
              Sign in to pick topics
            </button>
          ) : (
          <>
          <p className="mt-0.5 text-sm text-muted">
            These come first in your programs.
          </p>
          <div
            role="group"
            aria-label="Things you are interested in"
            className="mt-3 flex flex-wrap gap-2"
          >
            {CATEGORIES.map(({ label, emoji, color }) => {
              const chosen = interests.includes(label);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => onToggleInterest(label)}
                  aria-pressed={chosen}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-2 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-transform hover:scale-[1.04]"
                  style={{ borderColor: chosen ? color : "#E2DEF0" }}
                >
                  <span aria-hidden>{emoji}</span>
                  {label}
                </button>
              );
            })}
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {interests.length === 0
              ? "Nothing chosen yet"
              : `${interests.length} chosen: ${interests.join(", ")}`}
          </p>
          </>
          )}

          <h2 className="mt-6 font-display text-lg font-bold text-ink">
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
              label="Head tracking"
              hint="Turn your head toward a screen edge to move, save, or open settings."
              checked={headEnabled}
              disabled={!headSupported}
              disabledHint="Needs a webcam on Chrome or Edge over https."
              onChange={onToggleHead}
            />
          </div>
        </div>
      )}
    </div>
  );
});

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

// Whole-flank target: click to move immediately, or hover/press to build a
// dwell that slides the carousel and repeats while the pointer stays. The
// arrow circle is a real button so keyboard and screen-reader users can
// navigate; the rest of the zone stays decorative.
const SideZone = memo(function SideZone({
  side,
  progress,
  active,
  disabled,
  onEnter,
  onLeave,
  onDown,
  onUp,
  onClick,
}: {
  side: "left" | "right";
  progress: number;
  active: boolean;
  disabled: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onDown: () => void;
  onUp: () => void;
  onClick: () => void;
}) {
  const isLeft = side === "left";
  return (
    <div
      onPointerEnter={disabled ? undefined : onEnter}
      onPointerLeave={onLeave}
      onPointerDown={disabled ? undefined : onDown}
      onPointerUp={onUp}
      onPointerCancel={onLeave}
      onClick={disabled ? undefined : onClick}
      className={`absolute inset-y-6 z-20 flex cursor-pointer items-center ${
        isLeft ? "left-0 justify-start pl-3" : "right-0 justify-end pr-3"
      }`}
      style={{ width: "calc(50% - 380px)", minWidth: "96px" }}
    >
      <div
        className="flex flex-col items-center gap-2 rounded-3xl px-4 py-6 transition-colors"
        style={{ background: active ? "rgba(232,49,138,0.08)" : "transparent" }}
      >
        <button
          type="button"
          aria-label={isLeft ? "Previous event" : "Next event"}
          aria-disabled={disabled || undefined}
          onClick={(e) => {
            // Zone onClick handles pointer clicks; stop the bubble so a
            // button click (mouse or keyboard) doesn't navigate twice.
            e.stopPropagation();
            if (!disabled) onClick();
          }}
          className="grid h-[124px] w-[152px] place-items-center rounded-full border-[1.5px] border-[#9A9A9A] bg-transparent text-5xl font-light text-[#5C5C5C] transition-transform"
          style={{ transform: active ? "scale(1.08)" : "none" }}
        >
          <span aria-hidden>{isLeft ? "←" : "→"}</span>
        </button>
        <span
          className="font-display text-2xl font-medium text-[#424242]"
          aria-hidden
        >
          {isLeft ? "Back" : "Next"}
        </span>
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-edge/70" aria-hidden>
          <div
            className="h-full rounded-full transition-[width] duration-75"
            style={{ width: `${Math.round(progress * 100)}%`, background: BERRY }}
          />
        </div>
      </div>
    </div>
  );
});

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
