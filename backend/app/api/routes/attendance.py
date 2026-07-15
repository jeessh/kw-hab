import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import get_current_user, get_db
from app.models.attendance import Attendance
from app.models.event import Event
from app.models.user import User
from app.schemas.event import EventOut

router = APIRouter(tags=["attendance"])


@router.post("/events/{event_id}/attend", status_code=status.HTTP_201_CREATED)
def attend_event(
    event_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not db.get(Event, event_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    existing = db.get(Attendance, {"user_id": user.id, "event_id": event_id})
    if existing:
        return {"ok": True, "already": True}
    db.add(Attendance(user_id=user.id, event_id=event_id))
    try:
        db.commit()
    except IntegrityError:
        # Lost a race with a concurrent attend (double-tap / retry): same
        # outcome as the pre-check, so stay idempotent instead of 500ing.
        db.rollback()
        return {"ok": True, "already": True}
    return {"ok": True}


@router.delete(
    "/events/{event_id}/attend", status_code=status.HTTP_204_NO_CONTENT
)
def unattend_event(
    event_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.get(Attendance, {"user_id": user.id, "event_id": event_id})
    if existing:
        db.delete(existing)
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
        .filter(Attendance.user_id == user.id)
        .options(joinedload(Event.host), selectinload(Event.images))
        .order_by(Event.starts_at.asc().nullslast(), Event.id.asc())
        .all()
    )
