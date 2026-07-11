import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

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
    db.commit()
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
    return [a.event for a in user.attending]
