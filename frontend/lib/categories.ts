export type CategoryStyle = { emoji: string; color: string };
export type Category = CategoryStyle & { label: string };

// The app's canonical topics. This one list drives three things that have to
// agree, or interest-matching silently stops working:
//   • the interest chips a member picks at signup / in settings
//   • the topic grouping in the member feed
//   • the Activity Type picker hosts choose from when adding a program
//
// Taken from KWHab_Event_Test_Data.xlsx — real programming from the six
// agencies, not a vocabulary we invented. The previous list was a hackathon
// guess and only 6 of 37 real events could be filed under it. Adding to this
// list is expected; renaming an entry is not, because matching compares stored
// labels (see sameCategory).
export const CATEGORIES: Category[] = [
  { label: "Education", emoji: "📚", color: "#4C6EE8" },
  { label: "Social", emoji: "🎉", color: "#E86A4C" },
  { label: "Recreation", emoji: "🎳", color: "#3AA0C2" },
  { label: "Support Group", emoji: "🤝", color: "#2FA36B" },
  { label: "Cooking", emoji: "🍳", color: "#E8318A" },
  { label: "Fundraising", emoji: "💛", color: "#E8A33D" },
  { label: "Youth Programs", emoji: "🧒", color: "#9B5BD6" },
  { label: "Wellness", emoji: "🌿", color: "#2F8F5B" },
  { label: "Fitness", emoji: "🏃", color: "#F59E0B" },
  { label: "Arts & Crafts", emoji: "🎨", color: "#E84C88" },
  { label: "Music", emoji: "🎧", color: "#6366F1" },
  { label: "Games", emoji: "🎮", color: "#3B82F6" },
  { label: "Sports", emoji: "🏐", color: "#22C55E" },
];

// Shown for a program with no topic. Not offered as an interest — "General"
// isn't a thing anyone is interested in.
export const FALLBACK_CATEGORY = "General";
const FALLBACK_STYLE: CategoryStyle = { emoji: "🎟️", color: "#5B5BD6" };

const BY_KEY = new Map<string, Category>(
  CATEGORIES.map((c) => [c.label.toLowerCase(), c]),
);

// Topics from the earlier hackathon list, kept only so events created against
// it keep a stable colour. They deliberately do NOT map onto a canonical topic
// — silently re-filing someone's "Hangout" as "Social" would misrepresent it.
const LEGACY_STYLES: Record<string, CategoryStyle> = {
  hangout: { emoji: "☕", color: "#22C55E" },
  food: { emoji: "🍌", color: "#E8318A" },
  advice: { emoji: "🌱", color: "#2FA36B" },
  arts: { emoji: "🎨", color: "#F59E0B" },
  newcomers: { emoji: "🧭", color: "#5B5BD6" },
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
