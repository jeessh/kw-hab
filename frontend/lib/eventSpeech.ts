import type { Event } from "@/lib/api";
import { countdown } from "@/lib/time";

// Spoken summary for an event: title, when, description.
export function eventToSpeech(event: Event): string {
  const parts: string[] = [event.title + "."];
  parts.push(countdown(event.starts_at) + ".");
  if (event.description) parts.push(event.description);
  return parts.filter(Boolean).join(" ");
}
