"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError, api } from "@/lib/api";
import { ALL_ICONS, emojiFor } from "@/lib/icons";

export const CYAN = "#35CDEE";

// One icon, not three — see ICON_POOL in core/icons.py for the trade this
// makes. The overlay still handles it as an ordered list so nothing here has to
// change if that decision is revisited.
const PICK_COUNT = 1;

/**
 * Signing in without leaving the feed.
 *
 * Saving is the only thing that needs an account, and it's asked for at the
 * moment it's needed — the member keeps the program they were looking at on
 * screen behind the overlay rather than being sent away to find it again.
 *
 * Two steps, because the credential is a name plus an ordered icon key: the
 * name narrows it, the icons open it.
 */
type Mode = "login" | "signup";

export function LoginOverlay({
  onClose,
  onSignedIn,
}: {
  onClose: () => void;
  /** Fired once the cookie is set. */
  onSignedIn: () => void;
}) {
  // Logging in and creating an account are the same two questions asked for
  // different reasons, and the overlay used to only do the first — "Sign up"
  // threw people out to /signup, losing the modal and the program behind it.
  // One surface, one switch, no navigation.
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<"name" | "icons">("name");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameReady = first.trim() !== "" && last.trim() !== "";

  function togglePick(slug: string) {
    setError(null);
    setPicked((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= PICK_COUNT) return prev;
      return [...prev, slug];
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ mode: "login" | "signup" | "conflict" }>(
        "/auth/user",
        {
          method: "POST",
          body: JSON.stringify({
            first_name: first,
            last_name: last,
            icons: picked,
            // Which door this is. Logging in never quietly creates a second
            // account, and creating one never silently signs you into
            // somebody else's.
            create_new: mode === "signup",
          }),
        },
      );
      if (res.mode === "conflict") {
        setError(
          mode === "login"
            ? "That icon doesn't match this name. Try another, or create an account."
            : "Somebody with that name already uses that icon. Pick a different one.",
        );
        setPicked([]);
        setBusy(false);
        return;
      }
      onSignedIn();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 400
          ? "Choose your icon."
          : "Something went wrong. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <div
      className="absolute inset-0 z-[60] grid place-items-center bg-white/40 px-6 backdrop-blur-md"
      // Clicking the backdrop closes it. Guarded on the target being the
      // backdrop itself, so a click that starts inside the panel and drifts out
      // (selecting text, mostly) doesn't dismiss the thing being read.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-overlay-title"
    >
      <div className="relative max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-3xl bg-white p-10 shadow-lift">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-6 top-5 text-2xl text-muted transition-colors hover:text-ink"
        >
          ✕
        </button>

        <h2
          id="login-overlay-title"
          className="font-display text-4xl font-extrabold text-ink"
        >
          {mode === "login" ? "Log in" : "Create an account"}
        </h2>

        {step === "name" ? (
          <>
            <p className="mt-4 text-xl text-ink">
              {mode === "login"
                ? "Your name and your icon are how you log in."
                : "Two things and you're done — your name, then an icon."}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <input
                autoFocus
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                placeholder="First Name"
                aria-label="First name"
                className="rounded-xl border-2 border-edge bg-[#F5F5F7] px-5 py-3.5 text-xl text-ink outline-none focus:border-accent"
              />
              <input
                value={last}
                onChange={(e) => setLast(e.target.value)}
                placeholder="Last Name"
                aria-label="Last name"
                className="rounded-xl border-2 border-edge bg-[#F5F5F7] px-5 py-3.5 text-xl text-ink outline-none focus:border-accent"
              />
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 text-xl text-ink">
              {mode === "login" ? "Which icon is yours?" : "Pick your icon."}
            </p>
            {/* Said plainly, because people were choosing one the way you
                choose an avatar and then couldn't understand why the wrong one
                wouldn't let them in. It's the password. */}
            <p className="mt-1 text-base text-muted">
              {mode === "login"
                ? "The one you chose when you signed up. It works like a password."
                : "This is your password — you'll tap it every time you log in, so pick one you'll remember. It isn't a profile picture."}
            </p>
            {/* Twelve tiles, which is now the whole pool — two rows of six,
                nothing hidden and nothing to scroll for. */}
            {/* The padding is the order badge's room to hang over a tile's
                corner. This is a scroll container, and a box that scrolls in
                one axis clips the other too — so the badge was being sliced off
                along the top row and the right-hand column, which is where the
                first icon someone picks tends to be. The negative margin keeps
                the tiles where they were. */}
            <div className="mt-6 -mx-2 grid grid-cols-6 gap-3 px-2 pt-2">
              {ALL_ICONS.map((slug) => {
                const order = picked.indexOf(slug);
                const isPicked = order !== -1;
                const full = picked.length >= PICK_COUNT && !isPicked;
                return (
                  <button
                    key={slug}
                    type="button"
                    onClick={() => togglePick(slug)}
                    aria-pressed={isPicked}
                    aria-label={
                      isPicked
                        ? `${slug}, chosen as icon ${order + 1}. Activate to remove.`
                        : `Choose ${slug}`
                    }
                    className={`relative grid aspect-square place-items-center rounded-xl border-2 bg-white text-2xl transition-transform ${
                      isPicked
                        ? "scale-105"
                        : full
                          ? "border-edge opacity-40"
                          : "border-edge hover:border-accent"
                    }`}
                    style={isPicked ? { borderColor: CYAN } : undefined}
                  >
                    <span aria-hidden>{emojiFor(slug)}</span>
                    {isPicked && (
                      <span
                        aria-hidden
                        className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold text-white"
                        style={{ background: CYAN }}
                      >
                        {order + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === "icons" && ALL_ICONS.length > 12 && (
          // A hidden scroll is a trap for anyone who doesn't expect one, and
          // the icon they need may be below the fold.
          <div className="mt-1 flex justify-center text-muted" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}

        {/* Switches door without leaving. "Sign up" used to navigate to the
            wizard, which threw away the modal and the program behind it —
            somebody who pressed it to save an event came back to neither. */}
        <p className="mt-6 text-base text-muted">
          {mode === "login"
            ? "First time here?"
            : "Already have an account?"}{" "}
          <button
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
              setPicked([]);
              setStep("name");
            }}
            className="font-semibold text-accent underline underline-offset-2"
          >
            {mode === "login" ? "Create an account" : "Log in"}
          </button>
        </p>

        {/* The way into the staff console.
            It used to live on the landing page, and the landing page is gone —
            which left the console reachable only by typing the URL. Here rather
            than on the feed itself: this is the sign-in surface, so it is where
            somebody who came to sign in as an organizer will be looking, and
            the feed stays free of chrome that members have no use for. */}
        <p className="mt-5 text-sm text-muted">
          Are you an organizer?{" "}
          <Link
            href="/host"
            className="font-semibold text-accent underline underline-offset-2"
          >
            Staff sign-in
          </Link>
        </p>

        {error && (
          <p role="alert" className="mt-4 font-semibold text-pop">
            {error}
          </p>
        )}

        <div className="mt-8 flex items-center justify-end gap-3">
          <div className="mr-auto flex items-center gap-2" aria-hidden>
            {(["name", "icons"] as const).map((s) => (
              <span
                key={s}
                className="h-2.5 rounded-full transition-all"
                style={{
                  width: step === s ? 28 : 10,
                  background: step === s ? CYAN : "#D0CEDA",
                }}
              />
            ))}
          </div>

          {step === "icons" && (
            <button
              onClick={() => {
                setError(null);
                setStep("name");
              }}
              disabled={busy}
              className="rounded-lg bg-[#D9D9D9] px-5 py-2.5 font-display text-lg font-semibold text-ink disabled:opacity-40"
            >
              Back
            </button>
          )}
          <button
            onClick={() => {
              if (step === "name") {
                setError(null);
                setStep("icons");
              } else {
                void submit();
              }
            }}
            disabled={
              busy ||
              (step === "name" ? !nameReady : picked.length !== PICK_COUNT)
            }
            className="rounded-lg px-6 py-2.5 font-display text-lg font-semibold text-ink transition-transform enabled:hover:scale-[1.03] disabled:opacity-40"
            style={{ background: CYAN }}
          >
            {step === "name"
              ? "Next"
              : busy
                ? "…"
                : mode === "login"
                  ? "Log in"
                  : "Create account"}
          </button>
        </div>
      </div>
    </div>
  );
}
