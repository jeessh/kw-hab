/**
 * Is this occurrence still to come?
 *
 * Measured from when it *ends*, not from midnight and not from when it starts.
 * The feed used to keep a program until the end of the day, so a Friday coffee
 * morning still read as upcoming all Friday afternoon; the saved panel used the
 * start instead, so the same program dropped off the moment it began. Two
 * surfaces, two answers, both wrong in different directions.
 *
 * An undated program is upcoming — "date to be announced" hasn't happened yet.
 * With no end time, the start is the best we have.
 */
export function isUpcoming(ev: {
  starts_at?: string | null;
  ends_at?: string | null;
}): boolean {
  const finish = ev.ends_at ?? ev.starts_at;
  if (!finish) return true;
  const at = new Date(finish).getTime();
  return Number.isNaN(at) ? true : at >= Date.now();
}

/**
 * Which session of a run this is — "3 of 16".
 *
 * The feed shows a repeating program once, at its next date, so this says where
 * in the run that date falls. It advances on its own: once this week's session
 * has finished the card moves to the next one, and the count moves with it.
 */
export function sessionLabel(ev: {
  series_index?: number | null;
  series_total?: number | null;
}): string | null {
  const { series_index: at, series_total: of } = ev;
  if (!at || !of || of < 2) return null;
  return `${at} of ${of}`;
}

/** Human "in 3 days" / "in 5 hours" / "starting now" from an ISO timestamp. */
export function countdown(iso?: string | null): string {
  if (!iso) return "Date to be announced";
  const start = new Date(iso).getTime();
  const diffMs = start - Date.now();

  if (diffMs <= 0) return "Happening now";

  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 1) return "in less than an hour";
  if (hours < 24) return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;

  const days = Math.round(hours / 24);
  if (days < 7) return `in ${days} ${days === 1 ? "day" : "days"}`;

  const weeks = Math.round(days / 7);
  return `in ${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}

export function whenLabel(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
