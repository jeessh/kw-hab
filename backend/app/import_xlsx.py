"""Import the agencies' event sheet.

Deliberately a script rather than an upload endpoint: this runs once against a
file somebody has read, and a self-serve importer would need answers about
duplicate handling and partial failure that nobody has asked for yet.

Idempotent by (title, first date) so a re-run doesn't double the calendar.

    .venv/bin/python -m app.import_xlsx path/to/KWHab_Event_Test_Data.xlsx
"""

import re
import sys
import uuid
from datetime import datetime, timedelta, timezone

from app.core.pricing import describe as describe_price
from app.core.recurrence import describe as describe_recurrence
from app.core.recurrence import occurrences
from app.db.session import SessionLocal
from app.models.event import Event
from app.models.host import Host

# "Weekly (Fridays)" / "Monthly (last Saturday)" / "Annual" / "One-time"
FREQ = {"weekly": "weekly", "monthly": "monthly", "annual": "annual"}
# How many dates to materialize for an open-ended recurring program. The sheet
# gives a cadence and no end, so this is a horizon, not a claim about reality —
# roughly a season for weeklies, which matches how the agencies plan.
HORIZON = {"weekly": 16, "monthly": 6, "annual": 2}


def parse_time_range(value: str):
    m = re.match(
        r"^\s*(\d{1,2}):(\d{2})\s*([AP]M)\s*-\s*(\d{1,2}):(\d{2})\s*([AP]M)\s*$",
        str(value or ""),
        re.I,
    )
    if not m:
        return None, None
    def to24(h, mi, ap):
        h = int(h) % 12
        if ap.upper() == "PM":
            h += 12
        return h, int(mi)
    return to24(m[1], m[2], m[3]), to24(m[4], m[5], m[6])


def parse_price(cost_type: str, amount: str):
    """The sheet's two cost columns into the structured model."""
    cost_type = str(cost_type or "").strip()
    amount = str(amount or "").strip()
    if "donation" in cost_type.lower():
        return "donation", None, None, None, None
    if cost_type.lower().startswith("free") or amount in ("-", "", "None"):
        return "free", None, None, None, None
    if amount.lower() == "pay-what-you-can":
        return "donation", None, None, None, None

    nums = [int(round(float(n.replace(",", "")) * 100))
            for n in re.findall(r"\$\s*([\d,]+(?:\.\d{2})?)", amount)]
    low = amount.lower()
    # "$175 per golfer / $650 per foursome" — the group price is the second.
    group = re.search(r"per (foursome|team|pair|table|family)", low)
    if group and len(nums) >= 2:
        size = {"foursome": 4, "team": 4, "pair": 2, "table": 6, "family": 4}[group[1]]
        return "per_group", nums[1], size, None, amount
    # "$40 per 8-week season" / "$60 for 8-class pass"
    series = re.search(r"(\d+)\s*[- ]?(?:week|class|session)", low)
    if series and nums:
        return "series", nums[-1], None, int(series[1]), amount
    if nums:
        return "per_session", nums[0], None, None, amount
    return "custom", None, None, None, amount


def run(path: str) -> None:
    import openpyxl

    wb = openpyxl.load_workbook(path, data_only=True)
    rows = list(wb["Event Examples"].iter_rows(values_only=True))
    hdr = [str(h).strip() for h in rows[0]]
    records = [dict(zip(hdr, r)) for r in rows[1:] if any(c is not None for c in r)]

    db = SessionLocal()
    try:
        # Live accounts only — importing onto a retired one would file real
        # programming under an organization that has left.
        hosts = {
            h.name.strip().lower(): h
            for h in db.query(Host).filter(Host.deleted_at.is_(None)).all()
        }
        existing = {
            (t.strip().lower(), s.date() if s else None)
            for t, s in db.query(Event.title, Event.starts_at).all()
        }
        made = created_series = skipped = 0
        missing_orgs: set[str] = set()

        for rec in records:
            org = str(rec["Posted By (NPO)"]).strip()
            host = hosts.get(org.lower())
            if not host:
                # Create the agency rather than silently dropping its events;
                # a superadmin can set the password and logo afterwards.
                host = Host(
                    name=org,
                    email=f"{re.sub(r'[^a-z0-9]+', '-', org.lower()).strip('-')}@kwhab.invalid",
                    password_hash="!",  # unusable until an invite is accepted
                    is_admin=False,
                )
                db.add(host)
                db.flush()
                hosts[org.lower()] = host
                missing_orgs.add(org)

            d = rec["Date"]
            day = d.date() if isinstance(d, datetime) else datetime.fromisoformat(str(d)[:10]).date()
            start_hm, end_hm = parse_time_range(rec["Time"])
            if not start_hm:
                skipped += 1
                continue
            start = datetime(day.year, day.month, day.day, *start_hm, tzinfo=timezone.utc)
            end = datetime(day.year, day.month, day.day, *end_hm, tzinfo=timezone.utc) if end_hm else None
            if end and end < start:  # crosses midnight
                end += timedelta(days=1)

            if (str(rec["Event Title"]).strip().lower(), start.date()) in existing:
                skipped += 1
                continue

            model, cents, group_size, sessions, note = parse_price(
                rec["Cost Type (Free/Paid)"], rec["Cost Amount"]
            )

            raw_freq = str(rec["Frequency"] or "").strip()
            key = next((k for k in FREQ if raw_freq.lower().startswith(k)), None)
            freq = FREQ.get(key, "once")
            # A series price defines the run: "$40 per 8-week season" is eight
            # dates, not however many the default horizon would have posted.
            count = sessions if model == "series" and sessions else HORIZON.get(freq, 1)
            dates = occurrences(start, freq, count=count) if freq != "once" else [start]
            series_id = uuid.uuid4()
            span = (end - start) if end else None
            # Keep the agency's own phrasing where they gave one.
            label = raw_freq if freq != "once" else None

            for i, when in enumerate(dates, start=1):
                db.add(
                    Event(
                        host_id=host.id,
                        title=str(rec["Event Title"]).strip(),
                        description=str(rec["Card Description (short)"] or "").strip(),
                        notes=str(rec["Extended Notes (detail view)"] or "").strip() or None,
                        category=str(rec["Activity Category"] or "").strip() or None,
                        location=str(rec["Location"] or "").strip() or None,
                        starts_at=when,
                        ends_at=when + span if span else None,
                        is_virtual="virtual" in str(rec["Event Format (Virtual/In-person)"]).lower(),
                        is_youth=str(rec["Youth Event (Y/N)"]).strip().lower().startswith("y"),
                        is_free=model in ("free", "donation"),
                        requires_signup="required" in str(rec["Registration Type"]).lower(),
                        registration_mode="internal",
                        pricing_model=model,
                        price_cents=cents,
                        price_group_size=group_size,
                        price_sessions=sessions,
                        price_note=note if model == "custom" else None,
                        series_id=series_id,
                        recurrence=label,
                        series_index=i,
                        series_total=len(dates),
                        accessibility_tags=[],
                    )
                )
                made += 1
            created_series += 1

        db.commit()
        print(f"{created_series} programs → {made} dated events. {skipped} skipped (already present).")
        if missing_orgs:
            print("organizations created (no password until invited):")
            for o in sorted(missing_orgs):
                print("   ", o)
    finally:
        db.close()


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else "KWHab_Event_Test_Data.xlsx")
