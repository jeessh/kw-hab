"use client";

import { CYAN } from "@/components/member/LoginOverlay";

/**
 * Offered the moment a sign-in completes, about the program the member was
 * looking at when they were asked to sign in.
 *
 * Signing in was a detour they only took to act on this program, so the
 * question is asked here rather than leaving them to find their way back and
 * press the same button again.
 */
export function RegisterPrompt({
  title,
  external,
  onSkip,
  onRegister,
}: {
  /** The program's name, for the accessible description. */
  title: string;
  /** Registration happens on the organizer's own site. */
  external?: boolean;
  onSkip: () => void;
  onRegister: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-[60] grid place-items-center bg-white/40 px-6 backdrop-blur-md"
      // Clicking the backdrop closes it. Guarded on the target being the
      // backdrop itself, so a click that starts inside the panel and drifts out
      // (selecting text, mostly) doesn't dismiss the thing being read.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onSkip();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="register-prompt-title"
    >
      <div className="w-full max-w-[520px] rounded-2xl bg-white p-8 shadow-lift">
        <p className="text-xl text-muted">You&apos;re signed in!</p>
        <h2
          id="register-prompt-title"
          className="mt-1 font-display text-4xl font-extrabold text-ink"
        >
          {external ? "Sign up on their site?" : "Register for this event?"}
        </h2>
        <p className="sr-only">{title}</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={onSkip}
            className="inline-flex items-center gap-2 rounded-lg bg-[#D9D9D9] px-5 py-3 font-display text-lg font-semibold text-ink transition-colors hover:bg-[#CDCDCD]"
          >
            <span aria-hidden>✕</span> Skip for now
          </button>
          <button
            onClick={onRegister}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-3 font-display text-lg font-semibold text-ink transition-transform hover:scale-[1.03]"
            style={{ background: CYAN }}
          >
            <span aria-hidden>✓</span>{" "}
            {external ? "Sign up on their site ↗" : "Register for event"}
          </button>
        </div>
      </div>
    </div>
  );
}
