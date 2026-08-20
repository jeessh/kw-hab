import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_host, get_db, require_admin
from app.core.security import hash_password
from app.models.event import Event
from app.models.host import Host
from app.schemas.host import (
    HostCreate,
    HostOut,
    HostSelfUpdate,
    HostUpdate,
    HostWithCountsOut,
)

router = APIRouter(prefix="/hosts", tags=["hosts"])


@router.get("/me", response_model=HostOut)
def get_me(host: Host = Depends(get_current_host)):
    return host


@router.patch("/me", response_model=HostOut)
def update_me(
    body: HostSelfUpdate,
    host: Host = Depends(get_current_host),
    db: Session = Depends(get_db),
):
    """Change your own organization's logo.

    Every account can do this for itself. Setting a logo used to be a superadmin
    errand, which meant an agency that rebranded had to ask KW Hab to upload a
    file for them — for the one thing on the platform that is unambiguously
    theirs, and the thing members use to recognise them in the feed.

    An empty string clears it, and the stepper falls back to initials.
    """
    fields = body.model_dump(exclude_unset=True)
    if "logo_url" in fields:
        host.logo_url = (fields["logo_url"] or "").strip() or None
    db.commit()
    db.refresh(host)
    return host


# ---------- Superadmin-only account management ----------
#
# Two tiers, both stored on `hosts`:
#   • admin       (is_admin=False) — manages only its own programs
#   • superadmin  (is_admin=True)  — manages any program, plus these routes
# Everything below is superadmin-only.


def _event_counts(db: Session) -> dict[uuid.UUID, int]:
    """Live programs owned, per host, in one query (not one per row). Archived
    ones are excluded — this count warns a superadmin how much programming a
    removal will retire, and an already-archived program isn't part of that."""
    rows = (
        db.query(Event.host_id, func.count(Event.id))
        .filter(Event.deleted_at.is_(None))
        .group_by(Event.host_id)
        .all()
    )
    return {host_id: count for host_id, count in rows}


def _superadmin_count(db: Session) -> int:
    """Live superadmins. Counting archived ones would let the guard below wave
    through the removal of the last person who can still sign in."""
    return (
        db.query(func.count(Host.id))
        .filter(Host.is_admin.is_(True), Host.deleted_at.is_(None))
        .scalar()
        or 0
    )


@router.get("", response_model=list[HostWithCountsOut])
def list_hosts(_: Host = Depends(require_admin), db: Session = Depends(get_db)):
    counts = _event_counts(db)
    hosts = (
        db.query(Host)
        .filter(Host.deleted_at.is_(None))
        .order_by(Host.created_at.asc())
        .all()
    )
    return [
        HostWithCountsOut(
            id=h.id,
            name=h.name,
            email=h.email,
            is_admin=h.is_admin,
            logo_url=h.logo_url,
            created_at=h.created_at,
            event_count=counts.get(h.id, 0),
        )
        for h in hosts
    ]


@router.post("", response_model=HostOut, status_code=status.HTTP_201_CREATED)
def create_host(
    body: HostCreate,
    _: Host = Depends(require_admin),
    db: Session = Depends(get_db),
):
    email = body.email.strip().lower()
    # Live accounts only — an archived one releases its address (see the
    # uq_hosts_email_live partial index), so an agency can be set up again.
    if (
        db.query(Host)
        .filter(Host.email == email, Host.deleted_at.is_(None))
        .first()
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    host = Host(
        name=body.name,  # already trimmed and non-blank by the schema
        email=email,
        password_hash=hash_password(body.password),
        is_admin=body.is_admin,
        logo_url=body.logo_url,
    )
    db.add(host)
    try:
        db.commit()
    except IntegrityError:
        # Race with a concurrent create for the same email.
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    db.refresh(host)
    return host


@router.patch("/{host_id}", response_model=HostOut)
def update_host(
    host_id: uuid.UUID,
    body: HostUpdate,
    current: Host = Depends(require_admin),
    db: Session = Depends(get_db),
):
    host = db.get(Host, host_id)
    if not host or host.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Admin not found")

    # Every field is optional, and an explicit null means "leave it alone" just
    # like omitting it — dropping them here keeps `is_admin: null` from being
    # written to a NOT NULL column further down.
    fields = {
        k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None
    }

    if "is_admin" in fields and fields["is_admin"] != host.is_admin:
        # Dropping your own superadmin rights locks you out of this very page,
        # with no way back in short of another superadmin noticing.
        if host.id == current.id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "You can't change your own access level.",
            )
        # Backstop only. Within a single request this can't fire: the caller is
        # a superadmin and can't be the target (guarded above), so a superadmin
        # target means at least two exist. It's here to narrow the window on
        # two superadmins concurrently demoting each other.
        if not fields["is_admin"] and _superadmin_count(db) <= 1:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "This is the last superadmin — promote someone else first.",
            )

    if fields.get("password"):
        host.password_hash = hash_password(fields["password"])
    if fields.get("name"):
        host.name = fields["name"]  # already trimmed and non-blank by the schema
    if "is_admin" in fields:
        host.is_admin = fields["is_admin"]
    # Null means "leave it alone" here, per the rule above, so an empty string
    # is how a logo gets removed.
    if "logo_url" in fields:
        host.logo_url = fields["logo_url"] or None

    db.commit()
    db.refresh(host)
    return host


@router.delete("/{host_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_host(
    host_id: uuid.UUID,
    current: Host = Depends(require_admin),
    db: Session = Depends(get_db),
):
    host = db.get(Host, host_id)
    if not host or host.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Admin not found")
    if host.id == current.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "You can't remove your own account."
        )
    # Same backstop as the demote path: unreachable in a single request, kept
    # to narrow the window on concurrent removals.
    if host.is_admin and _superadmin_count(db) <= 1:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This is the last superadmin — promote someone else first.",
        )

    # Archive both the account and its programming, rather than deleting the
    # row. Host.events cascades delete-orphan, so db.delete(host) would destroy
    # every program this agency ever published — including ones members have
    # saved and attendance the agency reports to funders.
    #
    # The programs stay attributed to the agency that ran them. They used to be
    # reassigned to whichever superadmin pressed the button, which kept them
    # visible but filed KW Hab's name on another agency's work, and left the
    # acting superadmin owning programs they had never seen. Retiring the
    # organizer retires their programming with them; the rows, the counts and
    # the attribution all survive.
    now = datetime.now(timezone.utc)
    db.query(Event).filter(
        Event.host_id == host.id, Event.deleted_at.is_(None)
    ).update({Event.deleted_at: now}, synchronize_session=False)
    host.deleted_at = now
    db.commit()
