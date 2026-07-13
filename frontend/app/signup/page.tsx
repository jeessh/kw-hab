"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ApiError, api } from "@/lib/api";
import { ALL_ICONS, emojiFor } from "@/lib/icons";

type Step = "name" | "icons" | "confirm" | "transition";

const PICK_COUNT = 3;

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("name");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  // Ordered selection — the tap sequence IS the credential.
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether the submit logged into an existing account or created a new one.
  const [mode, setMode] = useState<"login" | "signup" | null>(null);

  function togglePick(slug: string) {
    setError(null);
    setPicked((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= PICK_COUNT) return prev; // already have 3
      return [...prev, slug];
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // One endpoint: logs in if this name + icon key already exists, else
      // creates the account. `mode` tells us which happened.
      const res = await api<{ mode: "login" | "signup" }>("/auth/user", {
        method: "POST",
        body: JSON.stringify({
          first_name: first,
          last_name: last,
          icons: picked,
        }),
      });
      setMode(res.mode);
      setStep("transition");
      // Cookie is set by the endpoint; let the transition play, then continue.
      window.setTimeout(() => router.replace("/events"), 1900);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(
          "Those icons already belong to someone else — go back and pick a different set.",
        );
      } else {
        setError("Something went wrong. Please try again.");
      }
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(120%_80%_at_50%_-10%,#ffffff,#EEEBF5_60%,#E6E1F2)] px-6 py-10">
      <AnimatePresence mode="wait">
        {/* ---------------- NAME ---------------- */}
        {step === "name" && (
          <motion.section
            key="name"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="w-full max-w-lg text-center"
          >
            <h1 className="font-display text-4xl font-extrabold text-ink">
              Welcome
            </h1>
            <p className="mt-2 text-lg text-muted">
              Just your name to get started.
            </p>
            <div className="mt-8 flex flex-col gap-4">
              <input
                autoFocus
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                placeholder="First name"
                aria-label="First name"
                className="rounded-2xl border-2 border-edge bg-white px-5 py-4 text-2xl outline-none focus:border-accent"
              />
              <input
                value={last}
                onChange={(e) => setLast(e.target.value)}
                placeholder="Last name"
                aria-label="Last name"
                className="rounded-2xl border-2 border-edge bg-white px-5 py-4 text-2xl outline-none focus:border-accent"
              />
            </div>
            {error && <p className="mt-4 text-pop">{error}</p>}
            <button
              disabled={!first.trim() || !last.trim()}
              onClick={() => {
                setError(null);
                setStep("icons");
              }}
              className="mt-8 w-full rounded-2xl bg-accent px-6 py-4 text-2xl font-semibold text-white shadow-card transition-transform enabled:hover:scale-[1.02] disabled:opacity-40"
            >
              Continue
            </button>

            {/* host entry point */}
            <p className="mt-6 text-sm text-muted">
              Are you an organizer?{" "}
              <Link
                href="/host"
                className="font-semibold text-accent underline underline-offset-2"
              >
                Log in as host
              </Link>
            </p>
          </motion.section>
        )}

        {/* ---------------- PICK ICONS ---------------- */}
        {step === "icons" && (
          <motion.section
            key="icons"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="w-full max-w-3xl text-center"
          >
            <h1 className="font-display text-4xl font-extrabold text-ink">
              Choose your 3 icons
            </h1>
            <p className="mt-2 text-lg text-muted">
              Pick 3 in an order you&apos;ll remember — they become your key to
              sign in.
            </p>

            {/* chosen sequence so far */}
            <div className="mt-6 flex items-center justify-center gap-3">
              {Array.from({ length: PICK_COUNT }).map((_, slot) => {
                const slug = picked[slot];
                return (
                  <div
                    key={slot}
                    className={`grid h-16 w-16 place-items-center rounded-2xl border-2 text-3xl ${
                      slug
                        ? "border-attend bg-white"
                        : "border-dashed border-edge bg-white/50 text-muted"
                    }`}
                  >
                    {slug ? (
                      <span aria-hidden>{emojiFor(slug)}</span>
                    ) : (
                      <span className="text-lg font-semibold">{slot + 1}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* screen-reader progress */}
            <p className="sr-only" role="status" aria-live="polite">
              {picked.length} of {PICK_COUNT} icons chosen
              {picked.length ? `: ${picked.join(", ")}` : ""}
            </p>

            {/* the table of 40 icons */}
            <div className="mt-8 grid grid-cols-5 gap-3 sm:grid-cols-8">
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
                    aria-disabled={full}
                    aria-label={
                      isPicked
                        ? `${slug}, chosen as icon ${order + 1}. Activate to remove.`
                        : full
                          ? `${slug}. You already have 3 icons; remove one to change.`
                          : `Choose ${slug}`
                    }
                    className={`relative grid aspect-square place-items-center rounded-2xl border-2 bg-white text-3xl shadow-card transition-all sm:text-4xl ${
                      isPicked
                        ? "scale-105 border-attend"
                        : full
                          ? "border-edge opacity-40"
                          : "border-edge hover:border-accent"
                    }`}
                  >
                    <span aria-hidden>{emojiFor(slug)}</span>
                    {isPicked && (
                      <span
                        aria-hidden
                        className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-attend text-xs font-bold text-white"
                      >
                        {order + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {error && <p className="mt-4 text-pop">{error}</p>}

            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                onClick={() => setStep("name")}
                className="rounded-2xl px-6 py-4 text-lg font-semibold text-muted hover:bg-white"
              >
                Back
              </button>
              {picked.length > 0 && (
                <button
                  onClick={() => setPicked([])}
                  className="rounded-2xl px-6 py-4 text-lg font-semibold text-muted hover:bg-white"
                >
                  Clear
                </button>
              )}
              <button
                disabled={picked.length !== PICK_COUNT}
                onClick={() => {
                  setError(null);
                  setStep("confirm");
                }}
                className="rounded-2xl bg-accent px-10 py-4 text-xl font-semibold text-white shadow-card transition-transform enabled:hover:scale-[1.02] disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          </motion.section>
        )}

        {/* ---------------- CONFIRM ---------------- */}
        {step === "confirm" && (
          <motion.section
            key="confirm"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="w-full max-w-lg text-center"
          >
            <h1 className="font-display text-4xl font-extrabold text-ink">
              Does this look right?
            </h1>
            <p className="mt-2 text-lg text-muted">
              This is your name and your sign-in key.
            </p>

            <p className="mt-8 font-display text-3xl font-extrabold text-ink">
              {first} {last}
            </p>

            <div className="mt-6 flex items-center justify-center gap-4">
              {picked.map((slug, idx) => (
                <div
                  key={slug}
                  className="relative grid h-24 w-24 place-items-center rounded-3xl border-4 border-attend bg-white text-6xl shadow-card"
                >
                  <span aria-hidden>{emojiFor(slug)}</span>
                  <span className="sr-only">
                    Icon {idx + 1}: {slug}
                  </span>
                  <span
                    aria-hidden
                    className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-attend text-sm font-bold text-white"
                  >
                    {idx + 1}
                  </span>
                </div>
              ))}
            </div>

            {error && <p className="mt-6 text-pop">{error}</p>}

            <div className="mt-10 flex items-center justify-center gap-3">
              <button
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setStep("icons");
                }}
                className="rounded-2xl px-6 py-4 text-lg font-semibold text-muted hover:bg-white disabled:opacity-40"
              >
                Change icons
              </button>
              <button
                disabled={busy}
                onClick={submit}
                className="rounded-2xl bg-accent px-10 py-4 text-xl font-semibold text-white shadow-card transition-transform enabled:hover:scale-[1.02] disabled:opacity-40"
              >
                {busy ? "…" : "Continue"}
              </button>
            </div>
          </motion.section>
        )}

        {/* ---------------- TRANSITION ---------------- */}
        {step === "transition" && (
          <motion.section
            key="transition"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className="flex items-center justify-center gap-3">
              {picked.map((slug, idx) => (
                <motion.div
                  key={slug}
                  initial={{ scale: 0, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{
                    delay: idx * 0.14,
                    type: "spring",
                    stiffness: 260,
                    damping: 18,
                  }}
                  className="grid h-20 w-20 place-items-center rounded-3xl bg-white text-5xl shadow-card"
                >
                  <span aria-hidden>{emojiFor(slug)}</span>
                </motion.div>
              ))}
            </div>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-8 font-display text-4xl font-extrabold text-ink"
            >
              {mode === "login"
                ? `Welcome back, ${first}!`
                : `You're in, ${first}!`}
            </motion.h1>
            <p className="mt-2 text-lg text-muted" role="status">
              {mode === "login"
                ? "Logging you in…"
                : "Setting up your account…"}
            </p>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
