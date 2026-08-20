/**
 * What a program offers, and what a member needs.
 *
 * The same slugs sit on both sides — `events.accessibility_tags` and
 * `users.accessibility_prefs` — and matching is string equality, exactly as it
 * is for topics. So this is the single source for both pickers, for the same
 * reason `CATEGORIES` is: a value that only exists on one side can never match
 * anyone.
 *
 * The vocabulary is taken from what the database already holds rather than
 * invented. It is deliberately short and expected to grow after the next focus
 * group — nothing here hardcodes a count, and an unknown slug (added straight
 * to the database, or by a later list) still matches and still renders, via
 * `tagLabel`.
 */
export type AccessibilityTag = {
  slug: string;
  label: string;
  emoji: string;
  /**
   * Answered somewhere else on the host form and written from there, so it is
   * never offered as a chip. Cost and drop-in are real access barriers, but
   * they already have first-class fields, and asking twice is how the two
   * answers end up disagreeing.
   */
  derived?: boolean;
};

export const ACCESSIBILITY_TAGS: AccessibilityTag[] = [
  { slug: "wheelchair_accessible", label: "Wheelchair accessible", emoji: "♿" },
  { slug: "sensory_friendly", label: "Sensory friendly", emoji: "🔉" },
  { slug: "childcare_provided", label: "Childcare provided", emoji: "🧸" },
  { slug: "transit_accessible", label: "Near transit", emoji: "🚌" },
  { slug: "asl_interpretation", label: "ASL interpretation", emoji: "🤟" },
  { slug: "free", label: "Free", emoji: "💸", derived: true },
  { slug: "no_registration", label: "Drop-in", emoji: "🚪", derived: true },
];

/** The ones a host ticks and a member picks. */
export const SELECTABLE_TAGS = ACCESSIBILITY_TAGS.filter((t) => !t.derived);

const BY_SLUG = new Map(ACCESSIBILITY_TAGS.map((t) => [t.slug, t]));

export const isDerivedTag = (slug: string) => BY_SLUG.get(slug)?.derived === true;

/**
 * A readable name for any slug, including one this list has never heard of —
 * `quiet_room` reads as "Quiet room". A tag added to the database before it is
 * added here should still be legible rather than showing as a raw slug.
 */
export function tagLabel(slug: string): string {
  const known = BY_SLUG.get(slug);
  if (known) return known.label;
  const words = slug.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const tagEmoji = (slug: string) => BY_SLUG.get(slug)?.emoji ?? "•";
