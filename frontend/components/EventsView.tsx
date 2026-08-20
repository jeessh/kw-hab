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
import Link from "next/link";
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
import { countdown, isUpcoming } from "@/lib/time";
import { useTextToSpeech } from "@/lib/useTextToSpeech";
import { useSpeechCommands } from "@/lib/useSpeechCommands";
import { useHeadTracking } from "@/lib/useHeadTracking";
import { HeadCursor } from "@/components/HeadCursor";
import { CalibrationOverlay } from "@/components/CalibrationOverlay";
import { eventToSpeech } from "@/lib/eventSpeech";
import { SavedEvents } from "@/components/SavedEvents";
import { SELECTABLE_TAGS } from "@/lib/accessibility";
import { CATEGORIES } from "@/lib/categories";
import { oneCardPerProgram, personalizedFeed } from "@/lib/feed";
import {
  bucketsFor,
  dimensionByKey,
  groupByBucket,
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
  CardDropTab,
  SaveZone,
  WideEventCard,
} from "@/components/member/FeedParts";

const DROP_THRESHOLD = 150; // drag-down px to save
const SETTINGS_THRESHOLD = 130; // drag-up px to open settings
const SWIPE_THRESHOLD = 90; // px sideways to page to the next/previous card
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
  const reduceMotion = useReducedMotion();
  const [me, setMe] = useState<Me | null>(initialMe);
  const [events, setEvents] = useState<Event[]>([]);
  const [i, setI] = useState(0);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  // How many programs are saved, which is not how many rows are saved.
  //
  // `saved` holds every occurrence id, because that is what answers "is this
  // card saved?" for whichever date is on screen. Counting it told a member who
  // pressed Save once on an eight-week league that they had eight saved things.
  // Tracked as its own set rather than derived from `events`, which loads on a
  // separate promise — deriving it flashed the row count until the feed
  // arrived. A one-off is its own program, keyed by id.
  const [savedPrograms, setSavedPrograms] = useState<Set<string>>(new Set());
  const programKey = (ev: Event) => ev.series_id ?? ev.id;
  const [status, setStatus] = useState<"loading" | "ready" | "empty">(
    "loading",
  );
  const [view, setView] = useState<"events" | "settings">("events");
  const [confirming, setConfirming] = useState(false);

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

  const cardWrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLButtonElement>(null); // fly target: the drop zone



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
        setSavedPrograms((prev) => {
          const merged = new Set(prev);
          attended.forEach((ev) => merged.add(programKey(ev)));
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
  const scoredFeed = useMemo(() => {
    // A program that already happened is not a thing anyone can attend.
    // Measured from when it ends, so this week's session drops off the feed as
    // it finishes and the next one takes its place — see lib/time.
    const upcoming = events.filter(isUpcoming);
    return personalizedFeed(upcoming, {
      interests: interests ?? [],
      accessPrefs: accessPrefs ?? [],
    });
  }, [events, interests, accessPrefs]);

  // What "See events by" is grouping on. Declared before the feed because the
  // one-at-a-time order depends on it.
  const dimension = useMemo(
    () => dimensionByKey(dimensionKey),
    [dimensionKey],
  );

  // One card per program rather than one per date, in both views.
  //
  // The grid used to keep every date, which was right while it was sectioned by
  // day — a weekly program belongs on each day it runs, and the heading above
  // told them apart. Sectioning by organization or topic took that away, and
  // the same program repeated twelve times down a section with nothing to
  // distinguish the copies.
  const programs = useMemo(
    () => oneCardPerProgram(scoredFeed),
    [scoredFeed],
  );

  // The order Next and Back walk: each stepper bucket's programs together, in
  // the order the stepper shows them.
  const feed = useMemo(
    () => groupByBucket(programs, dimension),
    [programs, dimension],
  );

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
  // Read off the grouped feed, so each bucket's index is the start of a
  // contiguous run and jumping to a dot lands on that run's first program.
  const buckets = useMemo(
    () => bucketsFor(feed, dimension),
    [feed, dimension],
  );
  // Which bucket the current card belongs to — what the stepper highlights and
  // what the label under the dropdown names.
  const activeBucket = current
    ? dimension.bucket(current)
    : { id: "", label: "", color: "#8A8AA0" };

  /**
   * How far along the rail the current program sits, 0→1.
   *
   * Measured against the dots rather than straight off `i / feed.length`,
   * because the sections aren't the same size: Extend-A-Family has eight
   * programs and Independent Living five, so a linear fill would sit between
   * two rings at the moment the member is standing on one. This lands exactly
   * on a ring when they reach it, and interpolates across the gap in between.
   *
   * Clamped at 1: the last ring is the end of the rail, so once they're in the
   * final section the bar is full and stays full.
   */
  const railProgress = useMemo(() => {
    if (buckets.length <= 1 || feed.length === 0) return 0;
    const at = buckets.findIndex((b) => b.id === activeBucket.id);
    if (at < 0) return 0;
    const start = buckets[at].index;
    const end = at + 1 < buckets.length ? buckets[at + 1].index : feed.length;
    const within = clamp01((i - start) / Math.max(1, end - start));
    return Math.min(1, (at + within) / (buckets.length - 1));
  }, [buckets, activeBucket.id, i, feed.length]);


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
      const [profile, attended] = await Promise.all([
        api<Me>("/users/me"),
        // Their saved programs, which were unreadable a moment ago. Without
        // this the count sits at zero and the list looks empty until a reload
        // — someone signs in precisely to see this and finds nothing.
        api<Event[]>("/users/me/events").catch(() => [] as Event[]),
      ]);
      setMe(profile);
      setSaved((prevSaved) => {
        const merged = new Set(prevSaved);
        attended.forEach((ev) => merged.add(ev.id));
        return merged;
      });
      setSavedPrograms((prev) => {
        const merged = new Set(prev);
        attended.forEach((ev) => merged.add(programKey(ev)));
        return merged;
      });
    } catch {
      /* the cookie is set; the next read will pick the profile up */
    }
    if (pending) setRegisterFor(pending);
  }, [authFor]);

  /**
   * Re-read what is actually saved, after a save or an un-save has landed.
   *
   * Saving a series-priced program enrols the member across the run, and
   * un-saving releases the run — but bounded by what the price covered and by
   * the date they joined, which is a rule the server owns and the client cannot
   * reproduce from an Event. Optimistically we touch the one id we know about,
   * so the press feels instant; this then reconciles with the truth. Without it
   * an eight-week league un-saved from one card left the other seven dates
   * still showing a filled bookmark until a reload.
   */
  const syncSaved = useCallback(async () => {
    if (!signedInRef.current) return;
    try {
      const attended = await api<Event[]>("/users/me/events");
      setSaved(new Set(attended.map((ev) => ev.id)));
      setSavedPrograms(new Set(attended.map(programKey)));
    } catch {
      /* leave the optimistic state; the next reload settles it */
    }
  }, []);

  const attend = useCallback(
    async (ev: Event) => {
      if (savedRef.current.has(ev.id)) return;
      if (!signedInRef.current) {
        toSignIn(ev);
        return;
      }
      setSrMessage(`Saved ${ev.title}`);
      setSaved((prevSaved) => new Set(prevSaved).add(ev.id));
      setSavedPrograms((prev) => new Set(prev).add(programKey(ev)));
      try {
        await api(`/events/${ev.id}/attend`, { method: "POST" });
        void syncSaved();
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
        setSavedPrograms((prev) => {
          const next = new Set(prev);
          next.delete(programKey(ev));
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
    [toSignIn, syncSaved],
  );

  const unsave = useCallback(async (ev: Event) => {
    setSaved((prevSaved) => {
      const next = new Set(prevSaved);
      next.delete(ev.id);
      return next;
    });
    setSavedPrograms((prev) => {
      const next = new Set(prev);
      next.delete(programKey(ev));
      return next;
    });
    setSrMessage(`Removed ${ev.title}`);
    try {
      await api(`/events/${ev.id}/attend`, { method: "DELETE" });
      void syncSaved();
    } catch {
      // Put it back rather than show it gone when it isn't.
      setSaved((prevSaved) => new Set(prevSaved).add(ev.id));
      setSavedPrograms((prev) => new Set(prev).add(programKey(ev)));
      setSrMessage(`Could not remove ${ev.title}.`);
    }
  }, [syncSaved]);

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
    // Only celebrate a save that actually happened. Signed out this bounces to
    // the sign-in overlay, and already-saved is a no-op — sweeping "Saved!"
    // across the card in either case tells the member something untrue.
    if (!signedInRef.current || savedRef.current.has(ev.id)) {
      void attend(ev);
      return;
    }
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

  // Read inside stable callbacks without re-creating them every render.
  const flyingRef = useRef(flying);
  flyingRef.current = flying;
  const viewRef = useRef(view);
  viewRef.current = view;

  // Arrows are buttons. They used to build a dwell on hover — rest a pointer
  // near one and the feed began paging on its own, and kept paging. That is a
  // gesture for people who cannot click, and head tracking calls next/back
  // directly without it, so it was only ever surprising the people who could.
  const navBlocked = () => flyingRef.current || viewRef.current === "settings";
  const clickNavLeft = useCallback(() => {
    if (!navBlocked()) prev();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prev]);
  const clickNavRight = useCallback(() => {
    if (!navBlocked()) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next]);

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

  // Same shape as toggleInterest, and the same reason for setI(0): a need
  // reorders the feed harder than a topic does, so leaving the cursor where it
  // was would drop the member onto an unrelated program.
  const toggleAccessPref = useCallback(
    (slug: string, label: string) => {
      const chosen = meRef.current?.accessibility_prefs ?? [];
      const adding = !chosen.includes(slug);
      void setPref({
        accessibility_prefs: adding
          ? [...chosen, slug]
          : chosen.filter((c) => c !== slug),
      });
      setI(0);
      setSrMessage(
        adding
          ? `Added ${label}. Showing programs that offer it first.`
          : `Removed ${label}. Showing your best matches from the start.`,
      );
    },
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
    // Clear it here rather than leaning on the navigation to remount us.
    // This used to `router.replace("/")` from /events, which threw the
    // component away and rebuilt it signed out. The feed is / now, so that
    // replace is a no-op: the cookie was gone but the chip still showed the
    // member's name and their saved programs were still on screen — signed out
    // everywhere except the part they were looking at.
    setMe(null);
    setSaved(new Set());
    setSavedPrograms(new Set());
    setDetailFor(null);
    setRegisterFor(null);
    closeSettings();
    setSrMessage("Signed out.");
  }, [closeSettings]);

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
  const { supported: voiceSupported, listening, lastHeard } = useSpeechCommands(
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

  // Say which program is in focus. Arrowing through the whole feed used to be
  // silent for a screen reader: the card is a div, not a live region, so
  // nothing announced that anything had changed.
  useEffect(() => {
    if (!current || view !== "events" || viewMode !== "carousel") return;
    const when = current.starts_at
      ? new Date(current.starts_at).toLocaleDateString(undefined, {
          month: "long",
          day: "numeric",
        })
      : "date to be announced";
    setSrMessage(
      `${current.title}. ${when}. ${current.location ?? ""}. ${i + 1} of ${feed.length}.`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, view, viewMode]);

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
          target.closest('[role="menu"]') ||
          target.closest('[role="dialog"]'))
      ) {
        return;
      }
      // The grid has no focused card, so the card actions have nothing to act
      // on. Firing them anyway saved programs nobody had seen.
      if (viewMode !== "carousel") return;
      // Any overlay owns the keyboard while it's up.
      if (authOpen || registerFor || detailFor || a11yOpen || dimOpen) return;
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
          // Saves on the press. It used to need the key held for a second,
          // which is the same auto-hold that fired for people resting a finger
          // on the card and never fired for people who let go early.
          if (!e.repeat) void saveCurrent();
          break;
        case "ArrowUp":
          e.preventDefault();
          if (!e.repeat) openSettings();
          break;
      }
    };
    const onUp = (e: KeyboardEvent) => {
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
          onSignIn={() => setAuthOpen(true)}
          onSignOut={() => void doLogout()}
        />
      </div>

      {/* TEMPORARY — a way into the staff console from the feed, for testing.
          The considered place for this is the sign-in overlay, where it also
          lives; this one is on the feed itself so the admin flow is one click
          away without signing in as a member first. Members have no use for it,
          so it stays small and out of the way — and it should come out before
          the agencies see this. */}
      <div className="absolute bottom-3 left-4 z-50">
        <Link
          href="/host"
          className="inline-flex min-h-[32px] items-center text-xs text-muted underline underline-offset-2 transition-colors hover:text-ink"
        >
          Staff sign-in
        </Link>
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
        lastHeard={lastHeard}
        interests={me?.interest_categories ?? []}
        onToggleInterest={toggleInterest}
        accessPrefs={me?.accessibility_prefs ?? []}
        onToggleAccessPref={toggleAccessPref}
        signedIn={signedIn}
        onSignIn={() => {
          // Close this panel on the way out. The sign-in overlay covers it, so
          // leaving it open left a hidden dialog still listening for Escape —
          // which then stole focus to a trigger nobody could see.
          setA11yOpen(false);
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
          // Same reason as the accessibility panel above: otherwise Escape
          // closes this panel behind the overlay instead of the overlay.
          closeSettings();
          setAuthFor(null);
          setAuthOpen(true);
        }}
        saved={saved}
        onToggleSave={toggleSave}
        onOpen={setDetailFor}
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
                    count={savedPrograms.size}
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
                <p className="mt-5 font-display text-2xl font-semibold text-ink">
                  {activeBucket.label}
                </p>
                <BucketStepper
                  buckets={buckets}
                  activeId={activeBucket.id}
                  progress={railProgress}
                  onJump={setI}
                />
              </>
            )}

            {viewMode === "grid" ? (
              <GridFeed
                events={programs}
                dimension={dimension}
                saved={saved}
                query={query}
                onOpen={setDetailFor}
                onToggleSave={toggleSave}
              />
            ) : (
            /* carousel */
            <div className="relative flex w-full flex-1 items-center justify-center">
              <SideZone side="left" onClick={clickNavLeft} />
              <SideZone side="right" onClick={clickNavRight} />

              {/* Card group.
                  Pointer-events-none so its transparent flanks pass clicks
                  through to the side zones; the card re-enables events. */}
              <motion.div
                // pb-14 is the drop tab's room. It hangs off the bottom of the
                // card, so without reserving for it the tab disappears behind
                // the save bar on a short window — exactly where the gesture it
                // advertises has to land.
                className="pointer-events-none absolute inset-0 z-30 grid place-items-center pb-14"
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
                  // Height-led, not width-led: the design's card is 37% of a
                  // tall window, and holding its width on a short one grew it to
                  // 46% and pushed the tab into the save bar. Width follows the
                  // ratio, up to the design's 880.
                  className="pointer-events-auto relative aspect-[2.3/1] h-full max-h-[382px] w-auto max-w-[880px]"
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
                  onDrag={(_, info) => {
                    const dyy = info.offset.y;
                    // Sideways travel is paging, not saving — don't fill the
                    // save zone while someone is swiping across.
                    if (Math.abs(info.offset.x) > Math.abs(dyy)) {
                      setSaveReveal(0);
                      setSettingsReveal(0);
                      return;
                    }
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
                    const dxx = info.offset.x;
                    setSaveReveal(0);
                    setSettingsReveal(0);
                    // Whichever axis they actually moved along. Comparing the
                    // two stops a sloppy downward drag that wandered sideways
                    // from paging instead of saving.
                    if (Math.abs(dxx) > Math.abs(dyy)) {
                      if (Math.abs(dxx) > SWIPE_THRESHOLD) {
                        if (dxx < 0) next();
                        else prev();
                      }
                      return;
                    }
                    if (dyy > DROP_THRESHOLD) void saveCurrent();
                    else if (dyy < -SETTINGS_THRESHOLD) openSettings();
                  }}
                  // No press-and-hold to save. Resting a finger on the card
                  // started a two-second countdown to saving it, which fired
                  // for people who were only steadying the phone and never
                  // fired for people who lifted early — the same mechanism
                  // reported as "too fast" and as "doesn't work". Saving is the
                  // drag, the arrow key and the button, all of which say what
                  // they are.
                  className="absolute inset-0 cursor-grab active:cursor-grabbing"
                >
                  {/* Behind the card so only the rounded tongue shows. */}
                  <CardDropTab />
                  <div className="relative h-full w-full overflow-hidden rounded-[28px] border-[1.5px] border-[#9A9A9A] bg-white">
                    <WideEventCard
                      event={current}
                      saved={alreadySaved}
                      onExpand={setDetailFor}
                    />
                    <AnimatePresence>
                      {confirming && <ConfirmSweep />}
                    </AnimatePresence>
                  </div>
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
            count={savedPrograms.size}
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
          external={
            registerFor.requires_signup &&
            registerFor.registration_mode === "external" &&
            !!registerFor.registration_url
          }
          onSkip={() => setRegisterFor(null)}
          onRegister={() => {
            const ev = registerFor;
            setRegisterFor(null);
            void attend(ev);
            // If registration lives on the organizer's site, saving is not
            // registering — send them there too, or they turn up unregistered
            // having pressed a button that said Register.
            if (
              ev.requires_signup &&
              ev.registration_mode === "external" &&
              ev.registration_url
            ) {
              openRegistration(ev);
            }
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
  lastHeard,
  interests,
  onToggleInterest,
  accessPrefs,
  onToggleAccessPref,
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
  /** The recognizer's most recent transcript, for the voice hint. */
  lastHeard: string;
  interests: string[];
  onToggleInterest: (label: string) => void;
  /** Slugs from lib/accessibility — what the member needs a program to offer. */
  accessPrefs: string[];
  onToggleAccessPref: (slug: string, label: string) => void;
  signedIn: boolean;
  onSignIn: () => void;
}) {
  // Escape closes it, and focus goes back to the trigger — otherwise keyboard
  // focus is stranded on a panel that is no longer there. A backdrop click was
  // the only way out, which is no way out at all without a mouse.
  //
  // Listening here rather than in the feed's keydown handler because that one
  // returns early for anything inside a [role="dialog"] and again while this
  // menu is open. Both are right for arrow keys — the panel owns them — and
  // wrong for Escape, which is how you leave. Capture, and without stopping
  // propagation, matching the menus in MemberChrome.
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      onOpenChange(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onOpenChange]);

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
        ref={triggerRef}
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Your settings: interests and accessibility"
        className="relative inline-flex min-h-[44px] items-center gap-1 rounded-full py-1 pl-1 pr-2 text-ink transition-transform hover:scale-105"
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
          // Not role="menu": this holds headings, paragraphs and switches, none
          // of which are menuitems. Screen readers entered application mode and
          // then found nothing to navigate.
          role="dialog"
          aria-label="Your settings"
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

          {/* Needs, not tastes — so they sort harder than topics do (see
              ACCESS_WEIGHT in lib/feed). Still only sorting: nothing is hidden
              from anyone, and most programs have said nothing either way. */}
          <h2 className="mt-6 font-display text-lg font-bold text-ink">
            What you need
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Programs that offer these come first.
          </p>
          <div
            role="group"
            aria-label="Things you need a program to offer"
            className="mt-3 flex flex-wrap gap-2"
          >
            {SELECTABLE_TAGS.map(({ slug, label, emoji }) => {
              const chosen = accessPrefs.includes(slug);
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => onToggleAccessPref(slug, label)}
                  aria-pressed={chosen}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-2 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-transform hover:scale-[1.04]"
                  style={{ borderColor: chosen ? "#35CDEE" : "#E2DEF0" }}
                >
                  <span aria-hidden>{emoji}</span>
                  {label}
                </button>
              );
            })}
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {accessPrefs.length === 0
              ? "Nothing chosen yet"
              : `${accessPrefs.length} chosen`}
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
              label="Speech to action"
              hint={
                // What it actually heard, once it has heard anything. The
                // recognizer mishears a four-word vocabulary often enough that
                // "it isn't working" and "it heard something else" look
                // identical from the outside — this tells them apart.
                listening && lastHeard
                  ? `Heard “${lastHeard}”. Say “next”, “back”, “save”, or “list”.`
                  : 'Say “next”, “back”, “save”, or “list”.'
              }
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
      {/* The track stays 44×24 — the button around it is 44×44.
          These three switches turn on the screen reader, voice control and head
          tracking, so they are the controls the people this app is for are most
          likely to need and least likely to hit precisely. A 24px-tall target
          for that is backwards. */}
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="group relative grid h-11 w-11 shrink-0 place-items-center disabled:opacity-40"
      >
        <span
          className={`relative block h-6 w-11 rounded-full transition-colors ${
            checked ? "bg-accent" : "bg-edge"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              checked ? "left-[22px]" : "left-0.5"
            }`}
          />
        </span>
      </button>
    </div>
  );
}

/* ---------------- confirm ---------------- */


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
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  const isLeft = side === "left";
  return (
    <div
      onClick={onClick}
      className={`absolute z-20 flex cursor-pointer items-center ${
        isLeft ? "left-0 justify-start pl-3" : "right-0 justify-end pr-3"
      }`}
      // A forgiving margin around the arrow, not the whole flank — 288 wide is
      // nearly twice the arrow, so an imprecise press still lands. Nothing here
      // reacts to hover any more: it is a click target, and only a click.
      style={{
        width: "min(288px, calc(50% - 300px))",
        minWidth: "96px",
        top: "50%",
        transform: "translateY(-50%)",
        height: "min(232px, 100%)",
      }}
    >
      <div className="flex flex-col items-center gap-2 rounded-3xl px-4 py-6">
        <button
          type="button"
          aria-label={isLeft ? "Previous event" : "Next event"}
          onClick={(e) => {
            // Zone onClick handles pointer clicks; stop the bubble so a
            // button click (mouse or keyboard) doesn't navigate twice.
            e.stopPropagation();
            onClick();
          }}
          className="grid h-[86px] w-[152px] place-items-center rounded-full border-[1.5px] border-[#9A9A9A] bg-transparent text-6xl font-light leading-none text-[#5C5C5C] transition-transform hover:scale-[1.04] active:scale-[0.98]"
        >
          <span aria-hidden>{isLeft ? "←" : "→"}</span>
        </button>
        <span
          className="font-display text-3xl font-medium text-[#424242]"
          aria-hidden
        >
          {isLeft ? "Back" : "Next"}
        </span>
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
