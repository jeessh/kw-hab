import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_host, get_db, require_admin, set_auth_cookie
from app.core.rate_limit import IP_LIMIT, client_key, enforce, record
from app.core.security import (
    create_access_token,
    credential_fingerprint,
    hash_password,
)
from app.models.host import Host
from app.models.invite import HostInvite

router = APIRouter(prefix="/invites", tags=["invites"])

INVITE_DAYS = 14


def _hash(token: str) -> str:
    """Tokens are long random strings, so a plain SHA-256 is right here — the
    slow hashing passwords need exists to survive guessing, and there is
    nothing to guess in 32 bytes of entropy."""
    return hashlib.sha256(token.encode()).hexdigest()


class InviteCreate(BaseModel):
    organization: str = Field(min_length=1)
    email: EmailStr
    is_admin: bool = False


class InviteAccept(BaseModel):
    token: str
    password: str = Field(min_length=8)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_invite(
    body: InviteCreate,
    current: Host = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Issue an invitation. Returns the token once — it isn't stored in the
    clear and can't be shown again."""
    email = body.email.strip().lower()
    # Live accounts only. An archived one has released its address, which is
    # what lets an agency that was removed be invited back under it.
    if (
        db.query(Host)
        .filter(Host.email == email, Host.deleted_at.is_(None))
        .first()
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "That email already has an account."
        )
    token = secrets.token_urlsafe(32)
    invite = HostInvite(
        token_hash=_hash(token),
        organization=body.organization.strip(),
        email=email,
        is_admin=body.is_admin,
        invited_by=current.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=INVITE_DAYS),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return {
        "id": str(invite.id),
        "token": token,
        "organization": invite.organization,
        "email": invite.email,
        "expires_at": invite.expires_at,
    }


@router.get("")
def list_invites(
    _: Host = Depends(require_admin), db: Session = Depends(get_db)
):
    """Outstanding invitations, so nobody is invited twice by accident."""
    rows = (
        db.query(HostInvite)
        .filter(HostInvite.accepted_at.is_(None))
        .order_by(HostInvite.created_at.desc())
        .all()
    )
    now = datetime.now(timezone.utc)
    return [
        {
            "id": str(r.id),
            "organization": r.organization,
            "email": r.email,
            "is_admin": r.is_admin,
            "expires_at": r.expires_at,
            "expired": r.expires_at < now,
        }
        for r in rows
    ]


@router.delete("/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invite(
    invite_id: uuid.UUID,
    _: Host = Depends(require_admin),
    db: Session = Depends(get_db),
):
    invite = db.get(HostInvite, invite_id)
    if invite and invite.accepted_at is None:
        db.delete(invite)
        db.commit()


@router.get("/{token}")
def preview_invite(token: str, db: Session = Depends(get_db)):
    """What the accept page shows before anyone types a password.

    Deliberately returns the organization and email so the invitee can see they
    were expected — an invitation that shows nothing is indistinguishable from
    a phishing link.
    """
    invite = _usable(db, token)
    return {"organization": invite.organization, "email": invite.email}


def _usable(db: Session, token: str) -> HostInvite:
    invite = (
        db.query(HostInvite).filter(HostInvite.token_hash == _hash(token)).first()
    )
    if not invite or invite.accepted_at is not None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "That invitation is no longer valid."
        )
    if invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status.HTTP_410_GONE, "That invitation has expired — ask for a new one."
        )
    return invite


@router.post("/accept")
def accept_invite(
    body: InviteAccept,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Create the organizer account and sign them straight in.

    The password is set here, by them, and never travels or gets read aloud —
    which is the whole point of inviting rather than creating.
    """
    ip_key = f"{client_key(request)}:invite"
    enforce(db, {ip_key: IP_LIMIT})

    try:
        invite = _usable(db, body.token)
    except HTTPException:
        record(db, ip_key)
        raise

    host = Host(
        name=invite.organization,
        email=invite.email,
        password_hash=hash_password(body.password),
        is_admin=invite.is_admin,
    )
    db.add(host)
    invite.accepted_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "That email already has an account."
        )
    db.refresh(host)
    set_auth_cookie(
        response,
        create_access_token(
            host.id,
            "host",
            is_admin=host.is_admin,
            cred_hash=credential_fingerprint(host.password_hash),
        ),
    )
    return {"id": str(host.id), "email": host.email, "name": host.name}
