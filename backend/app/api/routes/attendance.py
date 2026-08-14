import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import get_current_user, get_db, get_optional_user
from app.core.rate_limit import CLICK_LIMIT, client_key, enforce, record
from app.models.attendance import REMOVED, SAVED, Attendance
from app.models.click import RegistrationClick
from app.models.event import Event
from app.models.user import User
from app.schemas.event import EventOut

router = APIRouter(tags=["attendance"])


@router.post(
    "/events/{event_id}/registration-click",
    status_code=status.HTTP_204_NO_CONTENT,
)
def record_registration_click(
    event_id: uuid.UUID,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """A member followed this program's outbound registration link.

    Public: the event page is public, and a click is worth counting whether or
    not we know who made it. When registration lives on the agency's own site
    this is the last observable step, so it stands in for "signed up" in the
    adoption numbers nonprofits report.
    """
    event = db.get(Event, event_id)
    if not event or event.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    ip_key = f"{client_key(request)}:clicks"
    enforce(db, {ip_key: CLICK_LIMIT})
    record(db, ip_key)
    db.add(
        RegistrationClick(event_id=event_id, user_id=user.id if user else None)
    )
    db.commit()


@router.post("/events/{event_id}/attend", status_code=status.HTTP_201_CREATED)
def attend_event(
    event_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = db.get(Event, event_id)
    if not event or event.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    existing = db.get(Attendance, {"user_id": user.id, "event_id": event_id})
    if existing:
        # A previously un-saved row is re-saved in place rather than recreated —
        # the row never went away, so an insert here would just hit the PK.
        if existing.status == SAVED:
            return {"ok": True, "already": True}
        existing.status = SAVED
        db.commit()
        return {"ok": True}
    # Row-lock the event before counting, so two people racing for the last
    # place can't both read "one left" and both get it.
    if event.capacity is not None:
        locked = (
            db.query(Event)
            .filter(Event.id == event_id)
            .with_for_update()
            .one()
        )
        taken = (
            db.query(func.count(Attendance.user_id))
            .filter(
                Attendance.event_id == event_id,
                Attendance.status == SAVED,
            )
            .scalar()
            or 0
        )
        if locked.capacity is not None and taken >= locked.capacity:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "This program is full.",
            )
    db.add(Attendance(user_id=user.id, event_id=event_id, status=SAVED))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # Unique violation (23505) = lost a race with a concurrent attend:
        # same outcome as the pre-check, stay idempotent. An FK violation
        # means the event was deleted mid-request: no attendance exists.
        if getattr(exc.orig, "sqlstate", None) == "23505":
            return {"ok": True, "already": True}
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    return {"ok": True}


@router.delete(
    "/events/{event_id}/attend", status_code=status.HTTP_204_NO_CONTENT
)
def unattend_event(
    event_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Un-saving flips the status; the row stays so the organizer's cumulative
    save count doesn't walk backwards."""
    existing = db.get(Attendance, {"user_id": user.id, "event_id": event_id})
    if existing and existing.status != REMOVED:
        existing.status = REMOVED
        db.commit()


@router.get("/users/me/events", response_model=list[EventOut])
def my_events(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    # One query with eager loads; iterating user.attending lazy-loads each
    # event (and then its host/images) row by row.
    return (
        db.query(Event)
        .join(Attendance, Attendance.event_id == Event.id)
        .filter(
            Attendance.user_id == user.id,
            Attendance.status == SAVED,
            Event.deleted_at.is_(None),
        )
        # attendees included: EventOut.saved_count reads it, and without this
        # every saved program costs an extra query on each member page load.
        .options(
            joinedload(Event.host),
            selectinload(Event.images),
            selectinload(Event.attendees),
        )
        .order_by(Event.starts_at.asc().nullslast(), Event.id.asc())
        .all()
    )
