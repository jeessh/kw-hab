from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import (
    clear_auth_cookie,
    get_db,
    set_auth_cookie,
)
from app.core.icons import icons_to_password, random_icon_set
from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.core.config import settings
from app.core.security import decode_token
from app.models.host import Host
from app.models.user import User
from app.schemas.auth import HostLogin, HostSignup, UserLogin, UserSignup

router = APIRouter(prefix="/auth", tags=["auth"])


def _make_username(first: str, last: str) -> str:
    return f"{first.strip().lower()}_{last.strip().lower()}".replace(" ", "")


def _allocate_unique_icons(db: Session) -> list[str]:
    """Pick a 3-icon set not already taken. Icons are the unique identifier."""
    for _ in range(50):
        icons = random_icon_set()
        taken = db.query(User).filter(User.icons == icons).first()
        if not taken:
            return icons
    raise HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "Could not allocate a unique icon set — expand the icon pool.",
    )


# ---------- Community members (icon auth) ----------


@router.post("/signup/user", status_code=status.HTTP_201_CREATED)
def signup_user(body: UserSignup, response: Response, db: Session = Depends(get_db)):
    icons = _allocate_unique_icons(db)
    using_custom = bool(body.custom_password)
    password = body.custom_password or icons_to_password(icons)

    user = User(
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip(),
        username=_make_username(body.first_name, body.last_name),
        password_hash=hash_password(password),
        auth_type="password" if using_custom else "icon",
        icons=icons,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    set_auth_cookie(response, create_access_token(user.id, "user"))
    # Return the icons so the FE can show the member their login credentials.
    return {
        "id": str(user.id),
        "username": user.username,
        "icons": user.icons,
        "auth_type": user.auth_type,
    }


@router.post("/login/user")
def login_user(body: UserLogin, response: Response, db: Session = Depends(get_db)):
    # Usernames are not unique, so check the password against every match.
    candidates = (
        db.query(User).filter(User.username == body.username.strip().lower()).all()
    )
    for user in candidates:
        if verify_password(body.password, user.password_hash):
            set_auth_cookie(response, create_access_token(user.id, "user"))
            return {"id": str(user.id), "username": user.username, "role": "user"}
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")


# ---------- Hosts / admins (email + password) ----------


@router.post("/signup/host", status_code=status.HTTP_201_CREATED)
def signup_host(body: HostSignup, response: Response, db: Session = Depends(get_db)):
    if db.query(Host).filter(Host.email == body.email.lower()).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    host = Host(
        name=body.name.strip(),
        email=body.email.strip().lower(),
        password_hash=hash_password(body.password),
    )
    db.add(host)
    db.commit()
    db.refresh(host)
    set_auth_cookie(
        response, create_access_token(host.id, "host", is_admin=host.is_admin)
    )
    return {"id": str(host.id), "email": host.email, "is_admin": host.is_admin}


@router.post("/login/host")
def login_host(body: HostLogin, response: Response, db: Session = Depends(get_db)):
    host = db.query(Host).filter(Host.email == body.email.strip().lower()).first()
    if not host or not verify_password(body.password, host.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    set_auth_cookie(
        response, create_access_token(host.id, "host", is_admin=host.is_admin)
    )
    return {"id": str(host.id), "email": host.email, "is_admin": host.is_admin}


# ---------- Session ----------


@router.post("/logout")
def logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


@router.get("/me")
def me(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get(settings.COOKIE_NAME)
    payload = decode_token(token) if token else None
    if not payload:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "role": payload.get("role"),
        "is_admin": payload.get("is_admin", False),
        "id": payload.get("sub"),
    }
