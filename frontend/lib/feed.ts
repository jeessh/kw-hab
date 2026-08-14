import type { Event } from "@/lib/api";
import { sameCategory } from "@/lib/categories";

// Weights for the personalized ordering. A topic the member picked outranks any
// single accessibility match, but several accessibility matches can still lift
// an off-topic program — someone who needs a wheelchair-accessible, childcare-
// provided program needs that more than they need it to be about cooking.
const TOPIC_WEIGHT = 3;
const ACCESS_WEIGHT = 1;

/**
 * The two profile fields that affect ordering. Taken as plain arrays rather
 * than the whole `Me` so callers can memoize on exactly what matters — patching
 * an unrelated preference (say, text-to-speech) hands back a new `Me` object
 * but the same arrays, and must not invalidate the feed.
 */
export type Taste = {
  interests: string[];
  accessPrefs: string[];
};

/**
 * How well one event matches this member. Higher sorts earlier; 0 means "no
 * signal", never "hide it".
 */
export function matchScore(event: Event, taste: Taste): number {
  let score = 0;
  if (taste.interests.some((c) => sameCategory(c, event.category))) {
    score += TOPIC_WEIGHT;
  }
  for (const pref of taste.accessPrefs) {
    if (event.accessibility_tags.includes(pref)) score += ACCESS_WEIGHT;
  }
  return score;
}

/**
 * Order the feed by match score without hiding anything — an explicitly
 * approved design rule: personalization reorders, it never filters. The only
 * things that remove cards are the member's own explicit filter choices.
 *
 * The server already returns a deterministic order (starts_at, created_at, id);
 * ties here fall back to that original index so the feed never reshuffles
 * between renders.
 */
export function personalizedFeed(events: Event[], taste: Taste): Event[] {
  return events
    .map((event, index) => ({ event, index, score: matchScore(event, taste) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.event);
}
