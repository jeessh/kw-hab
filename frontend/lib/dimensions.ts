import type { Event } from "@/lib/api";
import { FALLBACK_ACTIVITY } from "@/lib/activities";
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
  | "all";

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
    bucket: (e) => {
      const label = e.category || FALLBACK_CATEGORY;
      return { id: label, label, color: categoryStyle(label).color };
    },
  },
  {
    key: "activityType",
    label: "Activity Type",
    heading: "Activity Type",
    emoji: "🎉",
    bucket: (e) => {
      const label = e.activity_type || FALLBACK_ACTIVITY;
      return { id: label, label, color: hashColor(label) };
    },
  },
  {
    key: "all",
    label: "All Events",
    heading: "All Events",
    emoji: "⚪",
    bucket: () => ({ id: "all", label: "Everything", color: GREY }),
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
