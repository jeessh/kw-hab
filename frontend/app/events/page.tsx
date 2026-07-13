"use client";

import { useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { EventsView } from "@/components/EventsView";
import { api, type Event } from "@/lib/api";

export default function EventsPage() {
  // Start the events fetch right away, in parallel with the auth gate, so cards
  // are ready the moment auth clears. Client-only (needs the cookie); the
  // swallow-catch covers auth failing and EventsView never mounting. (Strict
  // Mode double-fires this GET in dev; harmless, and keeps the parallelism.)
  const [eventsPromise] = useState<Promise<Event[]>>(() => {
    if (typeof window === "undefined") return Promise.resolve([]);
    const p = api<Event[]>("/events");
    p.catch(() => {});
    return p;
  });
  return (
    <AuthGate>
      {(me) => <EventsView initialMe={me} eventsPromise={eventsPromise} />}
    </AuthGate>
  );
}
