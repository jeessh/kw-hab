"use client";

import { useState } from "react";
import { ApiError, api } from "@/lib/api";
import { ALL_ICONS, emojiFor } from "@/lib/icons";

export const CYAN = "#35CDEE";

const PICK_COUNT = 3;

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
export function LoginOverlay({
  onClose,
  onSignedIn,
  onSignUp,
}: {
  onClose: () => void;
  /** Fired once the cookie is set. */
  onSignedIn: () => void;
  /** Send them to the full sign-up wizard instead. */
  onSignUp: () => void;
}) {
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

  async function logIn() {
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
            // This is the log-in door. Somebody whose icons don't match an
            // existing account is told so, not quietly given a second one.
            create_new: false,
          }),
        },
      );
      if (res.mode === "conflict") {
        setError("Those icons don't match. Try again.");
        setPicked([]);
        setBusy(false);
        return;
      }
      onSignedIn();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 400
          ? "Pick 3 different icons."
          : "Something went wrong. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <div
      className="absolute inset-0 z-[60] grid place-items-center bg-white/40 px-6 backdrop-blur-md"
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
          You&apos;re not logged in yet!
        </h2>

        {step === "name" ? (
          <>
            <p className="mt-4 text-xl text-ink">
              Log in with your name to keep track of your saved events.
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
            <p className="mt-4 text-xl text-ink">Choose your personal icon.</p>
            {/* Twelve tiles visible, as the design has it. The pool behind
                them stays whole: the icon set IS the password, and 37 members
                already hold keys drawn from all of it — trimming it to fit the
                frame would lock most of them out and cut the keyspace from
                ~59,000 to 1,320. Exactly two rows, then it scrolls. */}
            <div className="mt-6 grid max-h-[152px] grid-cols-6 gap-3 overflow-y-auto">
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

        <p className="mt-5 text-base text-muted">Don&apos;t have an account?</p>
        <button
          onClick={onSignUp}
          className="mt-1.5 rounded-lg bg-[#D9D9D9] px-5 py-2.5 font-display text-xl font-semibold text-ink transition-colors hover:bg-[#CDCDCD]"
        >
          Sign up
        </button>

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
                void logIn();
              }
            }}
            disabled={
              busy ||
              (step === "name" ? !nameReady : picked.length !== PICK_COUNT)
            }
            className="rounded-lg px-6 py-2.5 font-display text-lg font-semibold text-ink transition-transform enabled:hover:scale-[1.03] disabled:opacity-40"
            style={{ background: CYAN }}
          >
            {step === "name" ? "Next" : busy ? "…" : "Log In"}
          </button>
        </div>
      </div>
    </div>
  );
}
