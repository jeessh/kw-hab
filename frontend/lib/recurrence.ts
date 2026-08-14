/** How often a program repeats. Mirrors app/core/recurrence.py. */
export type Frequency = "once" | "weekly" | "biweekly" | "monthly" | "annual";

export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "once", label: "One time" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every other week" },
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annually" },
];

/**
 * How a card says a program comes back — "Weekly (Fridays)", "Monthly (last
 * Saturday)".
 *
 * The feed shows one card per program at its next date, so this is what tells
 * a member the date they're looking at isn't the only one. Passed through as
 * the agency wrote it (events.recurrence is a phrase, not the Frequency enum),
 * because "Weekly (Fridays)" answers "can I make it?" and "weekly" doesn't.
 *
 * A one-time program stores no phrase and gets none: not repeating is the
 * default expectation, and saying so would be interface text explaining itself.
 */
export function repeatLabel(recurrence?: string | null): string | null {
  const label = recurrence?.trim();
  return label ? label : null;
}
