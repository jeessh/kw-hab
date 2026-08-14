/**
 * What kind of thing a program is, as distinct from what it's about.
 *
 * `CATEGORIES` is the topic — Cooking, Sports, Arts. This is the shape: whether
 * you'd be sitting in a class, dropping into a social, or going somewhere. Both
 * matter to "is this for me?", and neither answers the other: a cooking class
 * and a cooking drop-in are different commitments to the same subject.
 *
 * Same rule as categories — hosts pick from this list rather than typing, so a
 * value can never exist that no member's choice can match.
 *
 * This vocabulary is a starting point drawn from how the existing calendar
 * describes its programming. It is the sort of thing the agencies should
 * correct; changing a label here changes what hosts can pick.
 */
export type ActivityType = { label: string; emoji: string };

export const ACTIVITY_TYPES: ActivityType[] = [
  { label: "Class", emoji: "📚" },
  { label: "Workshop", emoji: "🛠️" },
  { label: "Social", emoji: "🎉" },
  { label: "Drop-in", emoji: "🚪" },
  { label: "Outing", emoji: "🚌" },
  { label: "Support group", emoji: "🤝" },
  { label: "Volunteering", emoji: "🌱" },
  { label: "Performance", emoji: "🎭" },
];

const BY_KEY = new Map(ACTIVITY_TYPES.map((a) => [a.label.toLowerCase(), a]));

export const FALLBACK_ACTIVITY = "Other";

export function activityStyle(label?: string | null): ActivityType {
  const found = BY_KEY.get((label ?? "").trim().toLowerCase());
  return found ?? { label: label || FALLBACK_ACTIVITY, emoji: "🎟️" };
}
