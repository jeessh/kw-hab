"use client";

import { useEffect, useState } from "react";
import { EventsView } from "@/components/EventsView";
import { ApiError, api, type Event, type Me } from "@/lib/api";

export default function EventsPage() {
  // The feed is public. GET /events needs no cookie, so browsing here is open
  // to everyone — a link a nonprofit shares has to lead somewhere a stranger
  // can actually use. Signing in is what saving requires, not what looking
  // requires.
  const [eventsPromise] = useState<Promise<Event[]>>(() => {
    if (typeof window === "undefined") return Promise.resolve([]);
    const p = api<Event[]>("/events");
    p.catch(() => {});
    return p;
  });
  // Already-saved programs, so the badge and count survive a reload. 401s for a
  // signed-out visitor, which is not an error here — they simply have none.
  const [attendedPromise] = useState<Promise<Event[]>>(() => {
    if (typeof window === "undefined") return Promise.resolve([]);
    const p = api<Event[]>("/users/me/events").catch(() => [] as Event[]);
    return p;
  });

  // undefined = still resolving, null = signed out, Me = signed in. The three
  // are distinct: rendering the feed before we know would flash the signed-out
  // affordances at a member who is signed in.
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    api<Me>("/users/me")
      .then((res) => alive && setMe(res))
      .catch((e) => {
        if (!alive) return;
        // Only a real 401 means "signed out". A network blip or a 5xx must not
        // show a signed-in member the signed-out app — they'd find their saved
        // list gone and a Sign in button where their profile was.
        if (e instanceof ApiError && e.status === 401) setMe(null);
        else setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (failed) {
    return (
      <main className="grid h-dvh place-items-center bg-[radial-gradient(120%_80%_at_50%_-10%,#ffffff,#EEEBF5_60%,#E6E1F2)] px-6 text-center">
        <div>
          <p className="font-display text-2xl text-ink">
            Couldn&apos;t reach the server.
          </p>
          <button
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-5 rounded-2xl bg-accent px-8 py-3 text-lg font-semibold text-white shadow-card transition-transform hover:scale-[1.02]"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (me === undefined) {
    return (
      <main className="grid h-dvh place-items-center bg-[radial-gradient(120%_80%_at_50%_-10%,#ffffff,#EEEBF5_60%,#E6E1F2)] text-muted">
        <p className="font-display text-2xl">Loading programs…</p>
      </main>
    );
  }

  return (
    <EventsView
      initialMe={me}
      eventsPromise={eventsPromise}
      attendedPromise={attendedPromise}
    />
  );
}
