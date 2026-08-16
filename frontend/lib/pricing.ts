/**
 * The shapes a program's cost comes in.
 *
 * Templates rather than a free-text price, because the structure carries
 * meaning a string can't: a series price means paying once enrols the member
 * in every date, and the platform has to know that to do it. Anything the
 * templates don't fit falls to `custom`, where the agency's own wording is
 * kept verbatim — a made-up structure is worse than plain text.
 */
export type PricingModel =
  | "free"
  | "donation"
  | "per_session"
  | "per_group"
  | "series"
  | "custom";

/**
 * The ways a paid program charges.
 *
 * Split out from the free/paid question rather than listed alongside it: asking
 * "which of six?" up front made choosing a cost harder than it is, when the
 * first question is only ever free or not. "Donations welcome" is gone — it
 * looked like a third kind of free and nobody could say what it meant for a
 * member deciding whether they could afford to come.
 */
export const PAID_MODELS: PricingModel[] = [
  "per_session",
  "per_group",
  "series",
  "custom",
];

export const PRICING_TEMPLATES: {
  value: PricingModel;
  label: string;
  hint: string;
  needsAmount: boolean;
  needsGroup?: boolean;
  needsSessions?: boolean;
}[] = [
  { value: "free", label: "Free", hint: "No cost to attend.", needsAmount: false },
  {
    value: "per_session",
    label: "Per session",
    hint: "A fee each time someone comes.",
    needsAmount: true,
  },
  {
    value: "per_group",
    label: "Per group",
    hint: "One fee covering several people — a team, a table, a foursome.",
    needsAmount: true,
    needsGroup: true,
  },
  {
    value: "series",
    label: "One fee for the whole run",
    hint: "Paying once signs them up for every date in the series.",
    needsAmount: true,
    needsSessions: true,
  },
  {
    value: "custom",
    label: "Something else",
    hint: "Describe it in your own words.",
    needsAmount: false,
  },
];

export const templateFor = (m: PricingModel) =>
  PRICING_TEMPLATES.find((t) => t.value === m) ?? PRICING_TEMPLATES[0];

/** Cents from what someone typed. "12.50" and "$12.50" both work. */
export function centsFrom(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export const dollarsFrom = (cents?: number | null) =>
  cents == null ? "" : String(cents / 100);
