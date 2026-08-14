"""Upcoming demo programming, for looking at the member feed with real shapes in it.

`app.seed` bootstraps an empty database and skips entirely once hosts exist, so
it can't top up a database that's been used. This tops up: it adds programs
dated from today forward and skips any title it already created, so running it
twice is safe.

Deliberately varied, because the feed's behaviour only shows up under variety —
every category so the topic stepper has something to step through, every
activity type, all four registration states, free and paid, dated and undated,
several organizations so the org stepper isn't a single dot.

    .venv/bin/python -m app.seed_demo
"""

from datetime import datetime, timedelta, timezone

from app.db.session import SessionLocal
from app.models.event import Event
from app.models.host import Host

# Hosts to spread the programming across, by email. Missing ones are skipped,
# so this works on a database seeded differently.
HOSTS = [
    "admin@kwhab.org",
    "hello@kwkitchen.org",
    "admin@admin.com",
    "host@admin.com",
]


def _image(slug: str) -> str:
    return f"https://picsum.photos/seed/{slug}/900/700"


# (title, category, activity_type, days_from_now, hour, is_free,
#  requires_signup, registration_mode, registration_url, tags, description, notes)
PROGRAMS = [
    (
        "Drop-In Community Lunch",
        "Food",
        "Drop-in",
        0,
        12,
        True,
        False,
        "internal",
        None,
        ["wheelchair_accessible", "transit_accessible", "free"],
        "A hot meal and company, every week. Come as you are — no sign-up, no cost, no need to tell anyone you're coming.",
        "Doors open at 11:30. There's always a vegetarian option, and staff can help with anything you need.",
    ),
    (
        "Afternoon Board Games",
        "Games",
        "Social",
        0,
        15,
        True,
        False,
        "internal",
        None,
        ["sensory_friendly", "wheelchair_accessible", "free"],
        "Cards, board games and puzzles in a quiet room. Play something or just sit with people.",
        None,
    ),
    (
        "Beginner Guitar Circle",
        "Music",
        "Class",
        1,
        18,
        True,
        True,
        "internal",
        None,
        ["wheelchair_accessible", "free"],
        "Six weeks of learning three chords and playing songs together. Guitars provided — you don't need to own one.",
        "Ask for Priya at the front desk. Spaces are limited, so let us know if you can't make a week.",
    ),
    (
        "No-Bake Cheesecake Bars",
        "Cooking",
        "Workshop",
        1,
        10,
        True,
        True,
        "external",
        "https://kwhab.ca/register/summer-baking",
        ["wheelchair_accessible", "childcare_provided", "free"],
        "Make something sweet without turning the oven on. You'll take home what you make.",
        "Registration is on our own site. Please tell us about allergies when you sign up.",
    ),
    (
        "Morning Walking Group",
        "Sports",
        "Drop-in",
        2,
        9,
        True,
        False,
        "internal",
        None,
        ["transit_accessible", "free"],
        "A gentle hour around the park at whatever pace suits you. Somebody walks at the back so nobody is left behind.",
        None,
    ),
    (
        "Watercolour for Absolute Beginners",
        "Arts",
        "Class",
        3,
        13,
        False,
        True,
        "internal",
        None,
        ["wheelchair_accessible", "sensory_friendly"],
        "No experience wanted. Four sessions covering the few things that make watercolour behave.",
        "$20 for all four sessions, materials included. Ask about a subsidy if cost is a barrier — it always is for someone.",
    ),
    (
        "Coffee & Conversation",
        "Hangout",
        "Social",
        3,
        10,
        True,
        False,
        "internal",
        None,
        ["wheelchair_accessible", "transit_accessible", "asl_interpretation", "free"],
        "An hour of coffee and talking. ASL interpretation every week.",
        None,
    ),
    (
        "Money & Budgeting Basics",
        "Advice",
        "Workshop",
        5,
        14,
        True,
        True,
        "external",
        "https://kwhab.ca/register/budgeting",
        ["wheelchair_accessible", "free"],
        "What a budget actually is, and how to make one that survives contact with a real month.",
        "Bring a bank statement if you have one — not required, but it makes the second half more useful.",
    ),
    (
        "Sensory-Friendly Film Afternoon",
        "Hangout",
        "Performance",
        6,
        14,
        True,
        False,
        "internal",
        None,
        ["sensory_friendly", "wheelchair_accessible", "free"],
        "Lights up, sound down, and nobody minds if you move around or need to step out.",
        None,
    ),
    (
        "Community Garden Volunteering",
        "Food",
        "Volunteering",
        8,
        10,
        True,
        True,
        "internal",
        None,
        ["transit_accessible", "free"],
        "Planting, weeding and watering. Tools and gloves provided, and everything grown goes to the food programs.",
        "Wear something you don't mind getting muddy. We go ahead in light rain.",
    ),
    (
        "Caregiver Support Group",
        "Advice",
        "Support group",
        9,
        18,
        True,
        True,
        "internal",
        None,
        ["wheelchair_accessible", "childcare_provided", "free"],
        "For anyone supporting a family member. A facilitated hour to say the hard parts out loud.",
        "Childcare is available if you tell us a week ahead.",
    ),
    (
        "Day Trip: St. Jacobs Market",
        "Hangout",
        "Outing",
        12,
        9,
        False,
        True,
        "external",
        "https://kwhab.ca/register/st-jacobs",
        ["wheelchair_accessible", "transit_accessible"],
        "A morning at the market, with a coach there and back. Support workers welcome at no charge.",
        "$12 covers the coach. Meet at the community centre by 8:45 — the coach leaves at 9 sharp.",
    ),
    (
        "Karaoke Night",
        "Music",
        "Social",
        15,
        19,
        True,
        False,
        "internal",
        None,
        ["wheelchair_accessible", "free"],
        "Sing, or come and be the audience. Both are the point.",
        None,
    ),
    (
        "Cooking on a Budget",
        "Cooking",
        "Class",
        22,
        17,
        True,
        True,
        "internal",
        None,
        ["wheelchair_accessible", "childcare_provided", "free"],
        "Five meals under five dollars a head, cooked together and taken home.",
        None,
    ),
    (
        "Seasonal Craft Fair",
        "Arts",
        "Performance",
        None,  # undated on purpose — the feed has to handle "date to be announced"
        11,
        True,
        False,
        "internal",
        None,
        ["wheelchair_accessible", "transit_accessible", "free"],
        "Stalls from community groups across the region. Date to be confirmed.",
        None,
    ),
]

LOCATIONS = [
    "KW Hab Community Room, 100 Ahrens St",
    "Kitchener Community Kitchen, 45 Weber St",
    "Victoria Park Pavilion, 80 Schneider Ave",
    "Waterloo Memorial Centre, 101 Father David Bauer Dr",
]


def run() -> None:
    db = SessionLocal()
    try:
        hosts = [
            h
            for email in HOSTS
            if (h := db.query(Host).filter(Host.email == email).first())
        ]
        if not hosts:
            print("No hosts found — run `python -m app.seed` first.")
            return

        existing = {t for (t,) in db.query(Event.title).all()}
        now = datetime.now(timezone.utc)
        added = 0

        for i, (
            title,
            category,
            activity,
            days,
            hour,
            is_free,
            requires_signup,
            mode,
            url,
            tags,
            description,
            notes,
        ) in enumerate(PROGRAMS):
            if title in existing:
                continue
            starts = (
                None
                if days is None
                else (now + timedelta(days=days)).replace(
                    hour=hour, minute=0, second=0, microsecond=0
                )
            )
            db.add(
                Event(
                    host_id=hosts[i % len(hosts)].id,
                    title=title,
                    description=description,
                    notes=notes,
                    category=category,
                    activity_type=activity,
                    location=LOCATIONS[i % len(LOCATIONS)],
                    starts_at=starts,
                    ends_at=None if starts is None else starts + timedelta(hours=2),
                    accessibility_tags=tags,
                    is_free=is_free,
                    requires_signup=requires_signup,
                    registration_mode=mode,
                    registration_url=url,
                    cover_image_url=_image(title.lower().replace(" ", "-")[:24]),
                )
            )
            added += 1

        db.commit()
        print(f"Added {added} programs across {len(hosts)} organizations.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
