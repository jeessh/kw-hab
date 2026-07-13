"use client";

import { AuthGate } from "@/components/AuthGate";
import { EventsView } from "@/components/EventsView";

export default function EventsPage() {
  return <AuthGate>{(me) => <EventsView initialMe={me} />}</AuthGate>;
}
