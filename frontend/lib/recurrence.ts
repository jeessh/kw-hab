/** How often a program repeats. Mirrors app/core/recurrence.py. */
export type Frequency = "once" | "weekly" | "biweekly" | "monthly" | "annual";

export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "once", label: "One time" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every other week" },
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annually" },
];
