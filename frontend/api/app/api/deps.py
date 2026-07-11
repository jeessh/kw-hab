import uuid

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_token
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


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    p = _payload(request)
    if not p or p.get("role") != "user":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in as a member")
    user = db.get(User, uuid.UUID(p["sub"]))
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found")
    return user


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
