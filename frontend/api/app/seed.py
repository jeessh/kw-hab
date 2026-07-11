"""Seed a couple of hosts (incl. an admin) and sample events.

Run:  python -m app.seed
"""

from datetime import datetime, timedelta, timezone

from app.core.security import hash_password
from app.db.session import Base, SessionLocal, engine
from app.models.event import Event
from app.models.event_image import EventImage
from app.models.host import Host

import app.models  # noqa: F401  (populate metadata)


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
        foodbank = Host(
            name="Waterloo Food Bank",
            email="hello@wfb.org",
            password_hash=hash_password("host123"),
        )
        db.add_all([admin, foodbank])
        db.flush()

        now = datetime.now(timezone.utc)
        e1 = Event(
            host_id=foodbank.id,
            title="Saturday Community Food Bank",
            description="Free groceries, no registration required.",
            category="Food",
            location="123 King St W, Kitchener",
            starts_at=now + timedelta(days=2),
            ends_at=now + timedelta(days=2, hours=3),
            accessibility_tags=["wheelchair_accessible", "free", "no_registration"],
            is_free=True,
            cover_image_url="https://placehold.co/800x400?text=Food+Bank",
        )
        e1.images.append(
            EventImage(url="https://placehold.co/600x400?text=Gallery+1", sort_order=0)
        )
        e2 = Event(
            host_id=admin.id,
            title="ESL Conversation Circle",
            description="Practice English in a welcoming, sensory-friendly space.",
            category="Newcomers",
            location="Kitchener Public Library",
            starts_at=now + timedelta(days=5),
            accessibility_tags=["sensory_friendly", "free", "childcare_provided"],
            is_free=True,
            cover_image_url="https://placehold.co/800x400?text=ESL+Circle",
        )
        db.add_all([e1, e2])
        db.commit()
        print("Seeded 2 hosts (admin@kwhab.org / admin123) and 2 events.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
