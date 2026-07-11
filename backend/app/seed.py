"""Seed hosts (incl. admins) and sample events.

Run:  python -m app.seed
"""

from datetime import datetime, timedelta, timezone

from app.core.security import hash_password
from app.db.session import Base, SessionLocal, engine
from app.models.event import Event
from app.models.event_image import EventImage
from app.models.host import Host

import app.models  # noqa: F401  (populate metadata)


def sample_events(now: datetime, kitchen: Host, admin: Host) -> list[Event]:
    """The demo event set: 3 Cooking (one needs signup), 2 Arts, 3 Advice.

    Signup adds no extra form — the member's account already holds everything
    the host needs, so attending just records an Attendance row.
    """
    return [
        # --- Cooking (3; the dumpling workshop needs registration) ---
        Event(
            host_id=kitchen.id,
            title="Community Soup & Bread Night",
            description=(
                "Drop in and cook a big pot of soup together, then share it. "
                "No experience needed — just show up hungry."
            ),
            category="Cooking",
            location="Kitchener Community Kitchen, 45 Weber St",
            starts_at=now + timedelta(days=2, hours=18),
            ends_at=now + timedelta(days=2, hours=20),
            accessibility_tags=["wheelchair_accessible", "free", "no_registration"],
            is_free=True,
            requires_signup=False,
            cover_image_url="https://placehold.co/800x400?text=Soup+Night",
        ),
        Event(
            host_id=kitchen.id,
            title="Weeknight Meals on a Budget",
            description=(
                "Cook three cheap, freezer-friendly dinners and take the recipes "
                "home. Drop in — ingredients are shared."
            ),
            category="Cooking",
            location="Kitchener Community Kitchen, 45 Weber St",
            starts_at=now + timedelta(days=3, hours=17),
            ends_at=now + timedelta(days=3, hours=19),
            accessibility_tags=["wheelchair_accessible", "free", "no_registration"],
            is_free=True,
            requires_signup=False,
            cover_image_url="https://placehold.co/800x400?text=Budget+Meals",
        ),
        Event(
            host_id=kitchen.id,
            title="Hands-On Dumpling Workshop",
            description=(
                "Learn to fold and cook dumplings from scratch. Ingredients and a "
                "station are reserved per person, so please sign up to hold your "
                "spot."
            ),
            category="Cooking",
            location="Kitchener Community Kitchen, 45 Weber St",
            starts_at=now + timedelta(days=4, hours=17, minutes=30),
            ends_at=now + timedelta(days=4, hours=19, minutes=30),
            accessibility_tags=["wheelchair_accessible", "free", "childcare_provided"],
            is_free=True,
            requires_signup=True,
            cover_image_url="https://placehold.co/800x400?text=Dumpling+Workshop",
        ),
        # --- Arts activities (2) ---
        Event(
            host_id=admin.id,
            title="Paint & Sip: Intro to Acrylics",
            description=(
                "Follow along and paint a simple landscape on canvas. All supplies "
                "provided — beginners welcome, no experience needed."
            ),
            category="Arts",
            location="KW Hab Community Room",
            starts_at=now + timedelta(days=5, hours=18),
            ends_at=now + timedelta(days=5, hours=20),
            accessibility_tags=["sensory_friendly", "free", "no_registration"],
            is_free=True,
            requires_signup=False,
            cover_image_url="https://placehold.co/800x400?text=Paint+Class",
        ),
        Event(
            host_id=admin.id,
            title="Beginner Pottery: Wheel Throwing",
            description=(
                "Get your hands muddy and shape your first bowl on the wheel. Clay "
                "and aprons supplied; come dressed to make a mess."
            ),
            category="Arts",
            location="Registry Theatre Studio, 122 Frederick St",
            starts_at=now + timedelta(days=6, hours=13),
            ends_at=now + timedelta(days=6, hours=15),
            accessibility_tags=["free", "no_registration"],
            is_free=True,
            requires_signup=False,
            cover_image_url="https://placehold.co/800x400?text=Pottery",
        ),
        # --- Life advice (3) ---
        Event(
            host_id=admin.id,
            title="Resume & Job Search Clinic",
            description=(
                "One-on-one guidance on resumes and job applications. Bring a draft "
                "or start fresh with a volunteer advisor."
            ),
            category="Advice",
            location="KW Hab Community Room",
            starts_at=now + timedelta(days=7, hours=10),
            ends_at=now + timedelta(days=7, hours=13),
            accessibility_tags=["sensory_friendly", "free", "no_registration"],
            is_free=True,
            requires_signup=False,
            cover_image_url="https://placehold.co/800x400?text=Resume+Clinic",
        ),
        Event(
            host_id=admin.id,
            title="Healthy Relationships Workshop",
            description=(
                "A supportive group talk on setting boundaries, communicating "
                "clearly, and spotting red flags — in any relationship."
            ),
            category="Advice",
            location="KW Hab Community Room",
            starts_at=now + timedelta(days=8, hours=18),
            ends_at=now + timedelta(days=8, hours=19, minutes=30),
            accessibility_tags=["wheelchair_accessible", "free", "no_registration"],
            is_free=True,
            requires_signup=False,
            cover_image_url="https://placehold.co/800x400?text=Relationships",
        ),
        Event(
            host_id=admin.id,
            title="Money & Budgeting Basics",
            description=(
                "Plain-language help with budgeting, banking, and paying down debt. "
                "Bring your questions — nothing is too small to ask."
            ),
            category="Advice",
            location="Kitchener Public Library, Central Branch",
            starts_at=now + timedelta(days=9, hours=14),
            ends_at=now + timedelta(days=9, hours=16),
            accessibility_tags=["wheelchair_accessible", "free", "no_registration"],
            is_free=True,
            requires_signup=False,
            cover_image_url="https://placehold.co/800x400?text=Budgeting",
        ),
    ]


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(Host).first():
            print("Data already present — skipping seed.")
            return

        admin = Host(
            name="KW Hab (Admin)",
            email="admin@kwhab.org",
            password_hash=hash_password("admin123"),
            is_admin=True,
        )
        # Convenience admin login for testing.
        test_admin = Host(
            name="Test Admin",
            email="admin@admin.com",
            password_hash=hash_password("testtest"),
            is_admin=True,
        )
        kitchen = Host(
            name="Kitchener Community Kitchen",
            email="hello@kwkitchen.org",
            password_hash=hash_password("host123"),
        )
        db.add_all([admin, test_admin, kitchen])
        db.flush()

        now = datetime.now(timezone.utc)
        events = sample_events(now, kitchen, admin)
        events[0].images.append(
            EventImage(url="https://placehold.co/600x400?text=Soup", sort_order=0)
        )
        db.add_all(events)
        db.commit()
        print(
            "Seeded 3 hosts (admin@kwhab.org / admin123, admin@admin.com / "
            "testtest) and 8 events (3 cooking incl. 1 signup, 2 arts, 3 advice)."
        )
    finally:
        db.close()


if __name__ == "__main__":
    run()
