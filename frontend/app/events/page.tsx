"use client";

import { useEffect, useState } from "react";
import { EventsView } from "@/components/EventsView";
import { api, type Event, type Me } from "@/lib/api";

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
  useEffect(() => {
    let alive = true;
    api<Me>("/users/me")
      .then((res) => alive && setMe(res))
      .catch(() => alive && setMe(null));
    return () => {
      alive = false;
    };
  }, []);

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
