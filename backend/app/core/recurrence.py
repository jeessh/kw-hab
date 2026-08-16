"""Turning "every Friday until December" into actual dated programs.

Occurrences are materialized — each one is a real `events` row sharing a
`series_id` — rather than stored as a rule and expanded on read. Capacity,
attendance, saves and reminders all attach to a specific date, and a virtual
occurrence has no row for them to attach to.

The vocabulary matches how the agencies already write it in their calendars
("Weekly (Fridays)", "Monthly (last Saturday)"), because that string is also
what gets shown back to a member.
"""

from datetime import datetime, timedelta

# How often, and the human phrasing that goes with it.
FREQUENCIES = {"once", "weekly", "biweekly", "monthly", "annual"}

# Cap on how many rows one form submission may create. A yearly program with a
# far-off end date shouldn't be able to write thousands of rows by accident.
MAX_OCCURRENCES = 104


class RecurrenceError(ValueError):
    """The rule can't produce a sensible series."""


def _add_months(dt: datetime, months: int) -> datetime:
    month = dt.month - 1 + months
    year = dt.year + month // 12
    month = month % 12 + 1
    # Clamp for short months: the 31st of January repeats on the 28th/29th of
    # February rather than skipping the month entirely.
    day = min(dt.day, [31, 29 if year % 4 == 0 and (year % 100 or year % 400 == 0) else 28,
                      31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return dt.replace(year=year, month=month, day=day)


def occurrences(
    start: datetime,
    frequency: str,
    count: int | None = None,
    until: datetime | None = None,
    indefinite: bool = False,
) -> list[datetime]:
    """Every start time in the series, first included.

    Either `count` or `until` bounds it — or `indefinite`, which is the agency
    saying out loud that the program has no planned end. A drop-in that has run
    every Friday for nine years has no session count to give, and making one up
    to satisfy the form put a wrong number on the listing.

    Without any of the three it is still an error: an unbounded repeating
    program is otherwise almost always a form filled in wrong, and guessing an
    end date on someone's behalf puts dates in the calendar nobody chose.

    Indefinite still materializes rows, so it runs to MAX_OCCURRENCES — about
    two years of weekly. Rows are what capacity and saves attach to, and two
    years is far enough out that extending it is a scheduled job, not a thing a
    member ever waits on.
    """
    frequency = (frequency or "once").lower()
    if frequency not in FREQUENCIES:
        raise RecurrenceError(f"Unknown frequency: {frequency}")
    if frequency == "once":
        return [start]
    if count is None and until is None and not indefinite:
        raise RecurrenceError(
            "A repeating program needs either a number of sessions or an end date."
        )
    if count is not None and count < 1:
        raise RecurrenceError("A series needs at least one session.")
    if until is not None and until < start:
        raise RecurrenceError("The end date is before the first session.")

    out: list[datetime] = []
    step = 0
    while len(out) < MAX_OCCURRENCES:
        # Always measured from the first date, never from the previous one.
        # Stepping month-by-month makes a program on the 31st drift: January
        # clamps to February 28th and then every later month inherits the 28th.
        # Offsetting from the start restores the 31st wherever the month allows.
        if frequency == "weekly":
            current = start + timedelta(days=7 * step)
        elif frequency == "biweekly":
            current = start + timedelta(days=14 * step)
        elif frequency == "monthly":
            current = _add_months(start, step)
        else:  # annual
            current = _add_months(start, 12 * step)
        if until is not None and current > until:
            break
        out.append(current)
        step += 1
        if count is not None and len(out) >= count:
            break
    return out


def describe(frequency: str, start: datetime) -> str | None:
    """The phrase shown on the listing, in the agencies' own idiom."""
    frequency = (frequency or "once").lower()
    if frequency == "once":
        return None
    day = start.strftime("%A")
    return {
        "weekly": f"Weekly ({day}s)",
        "biweekly": f"Every other {day}",
        "monthly": f"Monthly ({day}s)",
        "annual": "Annual",
    }.get(frequency)
