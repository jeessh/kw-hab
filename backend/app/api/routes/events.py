import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_host, get_db
from app.core.storage import StorageError, upload_image
from app.models.event import Event
from app.models.event_image import EventImage
from app.models.host import Host
from app.schemas.event import EventCreate, EventOut, EventUpdate

router = APIRouter(prefix="/events", tags=["events"])

# Cover + gallery uploads accept these; must match the bucket's allowed types.
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


@router.post("/images", status_code=status.HTTP_201_CREATED)
async def upload_event_image(
    file: UploadFile = File(...),
    _host: Host = Depends(get_current_host),  # host-only
):
    """Upload a cover/gallery image and return its public URL.

    The frontend uploads on drop/select, then stores the returned URL on the
    event via the normal create/patch flow — no schema change.
    """
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Please choose a PNG, JPEG, WebP, or GIF image.",
        )
    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "Image is too large (max 5 MB).",
        )
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The file is empty.")

    try:
        url = upload_image(data, file.content_type)
    except StorageError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    return {"url": url}


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
    query = db.query(Event).options(joinedload(Event.host))
    if category:
        query = query.filter(Event.category == category)
    if free is not None:
        query = query.filter(Event.is_free == free)
    if tag:
        query = query.filter(Event.accessibility_tags.any(tag))
    if q:
        query = query.filter(Event.title.ilike(f"%{q}%"))
    # Chronological, with stable tiebreakers so the order is deterministic
    # across requests. Without these, events sharing a starts_at (or both
    # undated → NULL) come back in arbitrary, varying order — which reads as the
    # feed being "out of order sometimes". created_at then id break ties.
    return (
        query.order_by(
            Event.starts_at.asc().nullslast(),
            Event.created_at.asc(),
            Event.id.asc(),
        ).all()
    )


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
