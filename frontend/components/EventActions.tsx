"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, api, type Event } from "@/lib/api";

/**
 * What a member can do about this program. Four states, from
 * `requires_signup` × `registration_mode`:
 *
 *   no signup            → Save. Drop-in; there is nothing to register for.
 *   signup + internal    → Sign up here, which is the same record as a save.
 *   signup + external    → Leave for the organizer's site, and count the click.
 *
 * Saving needs an account; following a link never does.
 */
export function EventActions({ event }: { event: Event }) {
  const router = useRouter();
  const params = useSearchParams();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const external =
    event.requires_signup &&
    event.registration_mode === "external" &&
    !!event.registration_url;

  const save = useCallback(
    async (resuming = false) => {
      setBusy(true);
      setError(null);
      try {
        await api(`/events/${event.id}/attend`, { method: "POST" });
        setSaved(true);
      } catch (e) {
        // Not signed in: keep where they were and what they wanted, so coming
        // back doesn't mean finding the program again and pressing twice.
        // While resuming they have just signed in, so a 401 means the cookie
        // didn't take — say so rather than bouncing them round the loop again.
        if (e instanceof ApiError && e.status === 401 && !resuming) {
          const next = encodeURIComponent(`/events/${event.id}?save=1`);
          router.push(`/signup?next=${next}`);
          return;
        }
        // Reported either way. A resumed save that fails silently is the worst
        // case: they did the work of signing in and nothing tells them it was
        // for nothing.
        setError("That didn't save. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [event.id, router],
  );

  // Returning from sign-in with the save still pending. Runs once; a signed-out
  // visitor who lands here with the flag simply gets nothing.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || params.get("save") !== "1") return;
    resumed.current = true;
    void save(true);
    router.replace(`/events/${event.id}`);
  }, [params, save, router, event.id]);

  function openRegistration() {
    // Open synchronously, inside the click. Awaiting the tracking call first
    // crosses a microtask boundary, which Safari treats as the end of the user
    // gesture — the popup then gets blocked and the member goes nowhere.
    window.open(event.registration_url!, "_blank", "noopener,noreferrer");
    // Fire-and-forget: the count is ours to lose, not theirs.
    void api(`/events/${event.id}/registration-click`, {
      method: "POST",
    }).catch(() => {});
  }

  // Registering elsewhere is the point of the visit, so it leads. Saving stays
  // available in every state, but it's the lesser action here.
  const saveLabel = saved
    ? "Saved ✓"
    : event.requires_signup && !external
      ? "Sign up"
      : "Save";
  const saveClass = external
    ? "rounded-2xl border-2 border-edge bg-white px-8 py-4 text-xl font-semibold text-ink transition-transform enabled:hover:scale-[1.02] disabled:opacity-60"
    : "rounded-2xl bg-accent px-8 py-4 text-xl font-semibold text-white shadow-card transition-transform enabled:hover:scale-[1.02] disabled:opacity-60";

  return (
    <div className="mt-8 flex flex-col gap-3">
      {external && (
        <>
          <button
            onClick={openRegistration}
            className="rounded-2xl bg-accent px-8 py-4 text-xl font-semibold text-white shadow-card transition-transform hover:scale-[1.02]"
          >
            Sign up on their site ↗
          </button>
          {/* The awareness cue is the destination itself — a hostname says
              "you are leaving" more plainly than a sentence about it does. */}
          <p className="text-center text-sm text-muted">
            {hostnameOf(event.registration_url)}
          </p>
        </>
      )}

      <button
        onClick={() => void save()}
        disabled={busy || saved}
        className={saveClass}
      >
        {saveLabel}
      </button>

      {error && (
        <p role="alert" className="text-center font-semibold text-pop">
          {error}
        </p>
      )}
    </div>
  );
}

function hostnameOf(url?: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
