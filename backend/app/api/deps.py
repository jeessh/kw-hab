import uuid

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import credential_fingerprint, decode_token
from app.db.session import SessionLocal
from app.models.host import Host
from app.models.user import User


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=settings.COOKIE_NAME, path="/")


def _payload(request: Request) -> dict | None:
    token = request.cookies.get(settings.COOKIE_NAME)
    return decode_token(token) if token else None


def _key_still_current(payload: dict, user: User) -> bool:
    """Whether this token was issued against the member's current icon key.

    Member sessions carry `cv`, a fingerprint of the credential in force when
    they signed in (see security.credential_fingerprint). Re-issuing a key
    changes the hash, so tokens opened with the old icons stop working here
    rather than a week later when they expire.

    A token with no `cv` predates this check and is refused: the alternative is
    honouring exactly the sessions a reset is supposed to close. The cost is
    one extra sign-in, which for a member is tapping their icons.
    """
    return payload.get("cv") == credential_fingerprint(user.password_hash)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    p = _payload(request)
    if not p or p.get("role") != "user":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in as a member")
    user = db.get(User, uuid.UUID(p["sub"]))
    # Tokens last a week, so an archived member could otherwise keep using the
    # app until theirs expired.
    if not user or user.deleted_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found")
    if not _key_still_current(p, user):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in again")
    return user


def get_optional_user(
    request: Request, db: Session = Depends(get_db)
) -> User | None:
    """The signed-in member, or None. For endpoints on public pages, where a
    signed-out visitor is a normal caller rather than an error."""
    p = _payload(request)
    if not p or p.get("role") != "user":
        return None
    user = db.get(User, uuid.UUID(p["sub"]))
    if not user or user.deleted_at is not None:
        return None
    # A stale session is a signed-out visitor here, not an error — the public
    # pages this backs work perfectly well without an account.
    return user if _key_still_current(p, user) else None


def get_current_host(request: Request, db: Session = Depends(get_db)) -> Host:
    p = _payload(request)
    if not p or p.get("role") != "host":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in as a host")
    host = db.get(Host, uuid.UUID(p["sub"]))
    if not host:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found")
    return host


def require_admin(host: Host = Depends(get_current_host)) -> Host:
    if not host.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return host
