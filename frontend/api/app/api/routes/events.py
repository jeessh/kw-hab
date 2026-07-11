import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_host, get_db
from app.models.event import Event
from app.models.event_image import EventImage
from app.models.host import Host
from app.schemas.event import EventCreate, EventOut, EventUpdate

router = APIRouter(prefix="/events", tags=["events"])


def _owns_or_admin(host: Host, event: Event) -> bool:
    return host.is_admin or event.host_id == host.id


@router.get("", response_model=list[EventOut])
def list_events(
    category: str | None = None,
    tag: str | None = None,
    free: bool | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
):
    """Public discovery feed with needs + accessibility filters."""
    query = db.query(Event)
    if category:
        query = query.filter(Event.category == category)
    if free is not None:
        query = query.filter(Event.is_free == free)
    if tag:
        query = query.filter(Event.accessibility_tags.any(tag))
    if q:
        query = query.filter(Event.title.ilike(f"%{q}%"))
    return query.order_by(Event.starts_at.asc().nullslast()).all()


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: uuid.UUID, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    return event


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(
    body: EventCreate,
    host: Host = Depends(get_current_host),
    db: Session = Depends(get_db),
):
    data = body.model_dump(exclude={"gallery"})
    event = Event(host_id=host.id, **data)
    for img in body.gallery:
        event.images.append(EventImage(**img.model_dump()))
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.patch("/{event_id}", response_model=EventOut)
def update_event(
    event_id: uuid.UUID,
    body: EventUpdate,
    host: Host = Depends(get_current_host),
    db: Session = Depends(get_db),
):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    if not _owns_or_admin(host, event):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your event")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(event, field, value)
    db.commit()
    db.refresh(event)
    return event


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: uuid.UUID,
    host: Host = Depends(get_current_host),
    db: Session = Depends(get_db),
):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    if not _owns_or_admin(host, event):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your event")
    db.delete(event)
    db.commit()
