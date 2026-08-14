import type { Event } from "@/lib/api";
import { FALLBACK_CATEGORY, categoryStyle } from "@/lib/categories";

/**
 * How the feed is grouped — the "See events by" choice.
 *
 * Grouping never removes cards. Picking a dimension changes what the stepper
 * above the card shows and what jumping lands on; the underlying order is still
 * the personalized feed. That keeps the standing rule (personalization sorts,
 * it never filters) true for this control too.
 */
export type DimensionKey =
  | "org"
  | "price"
  | "registration"
  | "eventType"
  | "activityType"
  | "age"
  | "cost";

export type Dimension = {
  key: DimensionKey;
  /** Short label, for the dropdown menu. */
  label: string;
  /** Long form, shown as the page heading. */
  heading: string;
  emoji: string;
  /** Which bucket an event belongs to. */
  bucket: (event: Event) => {
    id: string;
    label: string;
    color: string;
    /** Shown instead of initials when the bucket has one. */
    logoUrl?: string | null;
  };
};

/** Used where a bucket has no colour of its own to carry. */
const GREY = "#8A8AA0";

/** Stable colour per bucket id, so a bucket keeps its colour across renders. */
const PALETTE = [
  "#E8318A",
  "#22C55E",
  "#9B5BD6",
  "#3B82F6",
  "#F59E0B",
  "#E86A4C",
  "#2FA36B",
];
function hashColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const DIMENSIONS: Dimension[] = [
  {
    key: "org",
    label: "Non-Profit Org.",
    heading: "Non-Profit Organization",
    emoji: "🏢",
    bucket: (e) => {
      const name = e.host_name || "Community";
      return {
        id: name,
        label: name,
        color: hashColor(name),
        logoUrl: e.host_logo_url ?? null,
      };
    },
  },
  {
    key: "price",
    label: "Price",
    heading: "Price",
    emoji: "💲",
    bucket: (e) =>
      e.is_free
        ? { id: "free", label: "Free", color: "#2FA36B" }
        : { id: "paid", label: "Paid", color: "#F59E0B" },
  },
  {
    key: "registration",
    label: "Registration Type",
    heading: "Registration Type",
    emoji: "📋",
    // The three states a member actually experiences. Whether sign-up is
    // internal or external only changes anything when sign-up is required, so
    // drop-in is one bucket rather than two.
    bucket: (e) => {
      if (!e.requires_signup) {
        return { id: "dropin", label: "Drop in", color: "#22C55E" };
      }
      return e.registration_mode === "external"
        ? { id: "external", label: "Sign up on their site", color: "#3B82F6" }
        : { id: "internal", label: "Sign up here", color: "#9B5BD6" };
    },
  },
  {
    key: "eventType",
    label: "Event Type",
    heading: "Event Type",
    emoji: "🗂️",
    // Virtual, in person, or for youth — the same three the admin filters on.
    bucket: (e) => {
      if (e.is_youth) return { id: "youth", label: "Youth", color: "#F59E0B" };
      return e.is_virtual
        ? { id: "virtual", label: "Virtual", color: "#3B82F6" }
        : { id: "inperson", label: "In person", color: "#2FA36B" };
    },
  },
  {
    key: "activityType",
    label: "Activity Type",
    heading: "Activity Type",
    emoji: "🎉",
    // The topic list. "Activity Type" is what the design calls it, and it is
    // what members pick as interests, so the feed groups on the same field the
    // matching runs on.
    bucket: (e) => {
      const label = e.category || FALLBACK_CATEGORY;
      return { id: label, label, color: categoryStyle(label).color };
    },
  },
  {
    key: "age",
    label: "Age",
    heading: "Age",
    emoji: "🎂",
    // Open-ended on either side: min 55 with no max reads as "55 and up".
    bucket: (e) => {
      if (e.min_age == null && e.max_age == null)
        return { id: "any", label: "All ages", color: GREY };
      if (e.max_age != null && e.max_age <= 17)
        return { id: "youth", label: "Under 18", color: "#F59E0B" };
      if (e.min_age != null && e.min_age >= 55)
        return { id: "older", label: "55 and up", color: "#9B5BD6" };
      return { id: "adults", label: "Adults", color: "#3B82F6" };
    },
  },
  {
    key: "cost",
    label: "Cost",
    heading: "Cost",
    emoji: "🎟️",
    bucket: (e) => {
      if (e.pricing_model === "donation")
        return { id: "donation", label: "Donations welcome", color: "#2FA36B" };
      if (e.is_free) return { id: "free", label: "Free", color: "#22C55E" };
      return { id: "paid", label: e.price_label || "Paid", color: "#F59E0B" };
    },
  },
];

export const dimensionByKey = (key: DimensionKey): Dimension =>
  DIMENSIONS.find((d) => d.key === key) ?? DIMENSIONS[0];

export type Bucket = {
  id: string;
  label: string;
  color: string;
  logoUrl?: string | null;
  /** Index in the feed of this bucket's first event — what jumping lands on. */
  index: number;
};

/** Buckets in first-appearance order, so the stepper reads left to right. */
export function bucketsFor(events: Event[], dimension: Dimension): Bucket[] {
  const seen = new Map<string, Bucket>();
  events.forEach((event, index) => {
    const b = dimension.bucket(event);
    if (!seen.has(b.id)) seen.set(b.id, { ...b, index });
  });
  return [...seen.values()];
}

/**
 * The feed reordered so each bucket's programs sit together, in the order the
 * stepper lays them out.
 *
 * The stepper draws a route across the top of the one-at-a-time view, so Next
 * has to walk it: finish this organization, then move to the next dot. Ordered
 * by date alone the buckets interleave, and stepping forward threw the active
 * dot back and forth across the rail — a progress indicator that doesn't
 * progress.
 *
 * Bucket order is still first appearance in the incoming order, so the
 * best-matching bucket leads, and inside a bucket the programs keep their
 * personalized-then-chronological order. Grouping reorders; like every other
 * ordering rule here it hides nothing.
 */
export function groupByBucket(events: Event[], dimension: Dimension): Event[] {
  const rank = new Map<string, number>();
  return events
    .map((event, index) => {
      const { id } = dimension.bucket(event);
      if (!rank.has(id)) rank.set(id, rank.size);
      return { event, index, rank: rank.get(id) as number };
    })
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.event);
}
