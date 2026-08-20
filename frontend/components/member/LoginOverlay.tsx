"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError, api } from "@/lib/api";
import { ALL_ICONS, emojiFor } from "@/lib/icons";

export const CYAN = "#35CDEE";

// Two icons, picked one at a time. Ordered, so the sequence is part of the key
// — see ICON_POOL in core/icons.py for the trade this makes.
const PICK_COUNT = 2;

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
  // Sign up is the door. Both modes ask the same two questions, so making the
  // member decide which one they are before answering them was a decision they
  // had no way to get right — and getting it wrong looked identical either way.
  // Signing up now logs you straight in if the name and icons already match an
  // account, and only creates one when they don't. "Log in" stays for someone
  // who wants the strict door, where an unknown key is told so rather than
  // quietly becoming a new account.
  const [mode, setMode] = useState<Mode>("signup");
  const [step, setStep] = useState<"name" | "icons">("name");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The name exists but this key does not open it. Distinct from any other
  // error because it is the only one a member cannot resolve by retrying.
  const [mismatch, setMismatch] = useState(false);

  const nameReady = first.trim() !== "" && last.trim() !== "";

  function togglePick(slug: string) {
    setError(null);
    setMismatch(false);
    setPicked((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= PICK_COUNT) return prev;
      return [...prev, slug];
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setMismatch(false);
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
            ? "Those icons don't match this name. Try again."
            : "Someone already signs in with that name. If it's you, try your icons again — if it isn't, use a different pair.",
        );
        setMismatch(true);
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
                ? "Your name and your two icons are how you log in."
                : "Your name, then two icons. If you've been here before, this signs you back in."}
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
              {mode === "login" ? "Which icons are yours?" : "Pick two icons."}
            </p>
            {/* Said plainly, because people were choosing one the way you
                choose an avatar and then couldn't understand why the wrong one
                wouldn't let them in. It's the password. */}
            <p className="mt-1 text-base text-muted">
              {mode === "login"
                ? "The two you chose when you signed up, in the same order."
                : "These two are your password — you'll tap them every time you log in, so pick ones you'll remember. They aren't a profile picture."}
            </p>

            {/* Which of the two they're on, and what they've chosen so far.
                One grid asked for two icons with nothing saying so read as a
                single choice that had stopped responding. */}
            <div className="mt-5 flex items-center gap-3">
              <p className="font-display text-lg font-bold text-ink">
                {picked.length >= PICK_COUNT
                  ? "Both chosen"
                  : `Icon ${picked.length + 1} of ${PICK_COUNT}`}
              </p>
              <div className="flex items-center gap-2">
                {Array.from({ length: PICK_COUNT }).map((_, slot) => {
                  const slug = picked[slot];
                  return (
                    <button
                      key={slot}
                      type="button"
                      // Tapping a filled slot takes it back, so a mistap is
                      // one press to undo rather than a start-again.
                      onClick={() =>
                        slug &&
                        setPicked((prev) => prev.filter((s) => s !== slug))
                      }
                      disabled={!slug}
                      aria-label={
                        slug
                          ? `Icon ${slot + 1}: ${slug}. Activate to change it.`
                          : `Icon ${slot + 1}: not chosen yet`
                      }
                      className="grid h-11 w-11 place-items-center rounded-xl border-2 text-2xl leading-none disabled:cursor-default"
                      style={{
                        borderColor: slug ? CYAN : "#D7D5DE",
                        borderStyle: slug ? "solid" : "dashed",
                        background: slug ? `${CYAN}1A` : "transparent",
                      }}
                    >
                      {slug ? (
                        <span aria-hidden className="glyph-centred">
                          {emojiFor(slug)}
                        </span>
                      ) : (
                        <span aria-hidden className="text-base text-muted">
                          {slot + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Twelve tiles, which is the whole pool — two rows of six,
                nothing hidden and nothing to scroll for. */}
            <div className="mt-4 -mx-2 grid grid-cols-6 gap-3 px-2 pt-2">
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
                        : `Choose ${slug} as icon ${picked.length + 1}`
                    }
                    className={`relative grid aspect-square place-items-center rounded-xl border-2 bg-white text-2xl leading-none transition-transform ${
                      isPicked
                        ? "scale-105"
                        : full
                          ? "border-edge opacity-40"
                          : "border-edge hover:border-accent"
                    }`}
                    style={isPicked ? { borderColor: CYAN } : undefined}
                  >
                    <span aria-hidden className="glyph-centred">
                      {emojiFor(slug)}
                    </span>
                    {isPicked && (
                      // Centred on the corner point itself rather than nudged
                      // by eye — half the badge sits inside the tile and half
                      // outside, on both axes, which is the only offset that
                      // reads as deliberate at any tile size.
                      <span
                        aria-hidden
                        className="absolute right-0 top-0 grid h-5 w-5 -translate-y-1/2 translate-x-1/2 place-items-center rounded-full text-[11px] font-bold leading-none text-white"
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
          {mode === "login" ? "Don't have an account yet?" : "Been here before?"}{" "}
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

        {/* Retrying is the right first move, so this sits under the retry
            prompt rather than replacing it — but a member who has forgotten
            the key can retry forever without getting in. */}
        {mismatch && (
          <p className="mt-2 text-base text-muted">
            Forgotten them? A staff member where you go for programs can set you
            a new key.
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
