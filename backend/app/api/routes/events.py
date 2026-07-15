import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session, joinedload, selectinload

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
_READ_CHUNK = 64 * 1024


def _sniff_image_type(head: bytes) -> str | None:
    """Actual image type from magic bytes; the client's header is untrusted."""
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if head.startswith(b"RIFF") and head[8:12] == b"WEBP":
        return "image/webp"
    return None


@router.post("/images", status_code=status.HTTP_201_CREATED)
async def upload_event_image(
    file: UploadFile = File(...),
    _host: Host = Depends(get_current_host),  # host-only
):
    """Upload a cover/gallery image and return its public URL.

    The frontend uploads on drop/select, then stores the returned URL on the
    event via the normal create/patch flow — no schema change.
    """
    # Read in chunks so the size cap is enforced during the read, not after
    # the whole body is already buffered.
    data = bytearray()
    while chunk := await file.read(_READ_CHUNK):
        data.extend(chunk)
        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                "Image is too large (max 5 MB).",
            )
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The file is empty.")

    content_type = _sniff_image_type(bytes(data[:16]))
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Please choose a PNG, JPEG, WebP, or GIF image.",
        )

    try:
        url = await upload_image(bytes(data), content_type)
    except StorageError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    return {"url": url}


def _owns_or_admin(host: Host, event: Event) -> bool:
    return host.is_admin or event.host_id == host.id


# Eager loads for EventOut serialization (host_name + images); without these
# each serialized row lazy-loads per-relation (N+1 through pgbouncer).
_EVENT_OUT_OPTIONS = (joinedload(Event.host), selectinload(Event.images))


@router.get("", response_model=list[EventOut])
def list_events(
    category: str | None = None,
    tag: str | None = None,
    free: bool | None = None,
    q: str | None = None,
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Public discovery feed with needs + accessibility filters."""
    query = db.query(Event).options(*_EVENT_OUT_OPTIONS)
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
        )
        .limit(limit)
        .offset(offset)
        .all()
    )


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: uuid.UUID, db: Session = Depends(get_db)):
    event = (
        db.query(Event)
        .options(*_EVENT_OUT_OPTIONS)
        .filter(Event.id == event_id)
        .first()
    )
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
