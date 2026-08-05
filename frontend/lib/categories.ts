export type CategoryStyle = { emoji: string; color: string };
export type Category = CategoryStyle & { label: string };

// The app's canonical topics. This one list drives three things that have to
// agree, or interest-matching silently stops working:
//   • the interest chips a member picks at signup / in settings
//   • the topic stepper + card colours in the member feed
//   • the category picker hosts choose from when adding a program
// Members pick these by icon as much as by word, so keep the list short and
// every entry visually distinct. Colours are used inline (card banners /
// tints) so they survive Tailwind purging.
export const CATEGORIES: Category[] = [
  { label: "Cooking", emoji: "🍳", color: "#E8318A" },
  { label: "Food", emoji: "🍌", color: "#E8318A" },
  { label: "Hangout", emoji: "☕", color: "#22C55E" },
  { label: "Sports", emoji: "🏐", color: "#3B82F6" },
  { label: "Games", emoji: "🎮", color: "#3B82F6" },
  { label: "Arts", emoji: "🎨", color: "#F59E0B" },
  { label: "Music", emoji: "🎧", color: "#6366F1" },
  { label: "Advice", emoji: "🌱", color: "#2FA36B" },
];

// Shown for events with no category. Not offered as an interest — "General"
// isn't a thing anyone is interested in.
export const FALLBACK_CATEGORY = "General";
const FALLBACK_STYLE: CategoryStyle = { emoji: "🎟️", color: "#5B5BD6" };

const BY_KEY = new Map<string, Category>(
  CATEGORIES.map((c) => [c.label.toLowerCase(), c]),
);

// Free-text categories that predate the picker. They keep their own look so
// existing events don't change colour, but they deliberately do NOT map onto a
// canonical topic — silently re-labelling someone's "Wellness" program as
// "Advice" would misrepresent it. They simply score no interest match.
const LEGACY_STYLES: Record<string, CategoryStyle> = {
  "food events": { emoji: "🍽️", color: "#E84C88" },
  sport: { emoji: "🏐", color: "#3AA0C2" },
  "sports & rec": { emoji: "🏐", color: "#3AA0C2" },
  "sport & rec": { emoji: "🏐", color: "#3AA0C2" },
  newcomers: { emoji: "🧭", color: "#5B5BD6" },
  wellness: { emoji: "🌿", color: "#2FA36B" },
  education: { emoji: "📚", color: "#4C6EE8" },
  social: { emoji: "🎉", color: "#E86A4C" },
  outdoors: { emoji: "🌲", color: "#2F8F5B" },
  technology: { emoji: "💻", color: "#4C6EE8" },
};

/** Normalized lookup key — categories compare case- and space-insensitively. */
const key = (c?: string | null) => (c ?? "").trim().toLowerCase();

/** The canonical label for a stored category, or null if it's off-taxonomy. */
export function canonicalCategory(category?: string | null): string | null {
  return BY_KEY.get(key(category))?.label ?? null;
}

/** True when two categories mean the same topic (case-insensitive). */
export function sameCategory(a?: string | null, b?: string | null): boolean {
  const ka = key(a);
  const kb = key(b);
  return ka !== "" && ka === kb;
}

// Stable fallback palette for unknown categories (hashed → same colour always).
const PALETTE = [
  "#E84C88",
  "#3AA0C2",
  "#E8A33D",
  "#5B5BD6",
  "#2FA36B",
  "#9B5BD6",
  "#E86A4C",
];

export function categoryStyle(category?: string | null): CategoryStyle {
  const k = key(category);
  if (!k) return FALLBACK_STYLE;
  const known = BY_KEY.get(k) ?? LEGACY_STYLES[k];
  if (known) return { emoji: known.emoji, color: known.color };
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return { emoji: FALLBACK_STYLE.emoji, color: PALETTE[h % PALETTE.length] };
}
