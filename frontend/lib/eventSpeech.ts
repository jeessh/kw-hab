import type { Event } from "@/lib/api";

/** Build a natural, spoken-language summary of an event for text-to-speech. */
export function eventToSpeech(event: Event): string {
  const parts: string[] = [event.title + "."];

  if (event.category) parts.push(`Category: ${event.category}.`);

  if (event.starts_at) {
    const d = new Date(event.starts_at);
    const day = d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const time = d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    parts.push(`When: ${day} at ${time}.`);
  }

  if (event.location) parts.push(`Location: ${event.location}.`);
  if (event.description) parts.push(event.description);

  if (event.accessibility_tags?.length) {
    const tags = event.accessibility_tags
      .map((t) => t.replace(/_/g, " "))
      .join(", ");
    parts.push(`Accessibility: ${tags}.`);
  }

  parts.push(event.is_free ? "This event is free." : "");

  return parts.filter(Boolean).join(" ");
}
