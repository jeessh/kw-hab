import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import (
    clear_auth_cookie,
    get_db,
    set_auth_cookie,
)
from app.core.icons import (
    credential,
    random_icon_set,
    validate_icon_selection,
)
from app.core.rate_limit import (
    IDENTITY_LIMIT,
    IP_LIMIT,
    clear as clear_rate_limit,
    client_key,
    enforce as enforce_rate_limit,
    record,
)
from app.core.security import (
    create_access_token,
    credential_fingerprint,
    hash_password,
    verify_password,
)
from app.core.config import settings
from app.core.security import decode_token
from app.models.host import Host
from app.models.user import User
from app.schemas.auth import HostLogin, UserAuth, UserLogin, UserSignup

router = APIRouter(prefix="/auth", tags=["auth"])


def _sign_in_member(response: Response, user: User) -> None:
    """Open a member session, bound to the key it was opened with.

    The token carries a fingerprint of the credential in force right now, and
    every request re-checks it — so re-issuing a member's icons ends the
    sessions the old icons opened, rather than leaving them live for the week a
    token lasts. That matters precisely when the reset was prompted by somebody
    else knowing the key.
    """
    set_auth_cookie(
        response,
        create_access_token(
            user.id, "user", cred_hash=credential_fingerprint(user.password_hash)
        ),
    )


def _make_username(first: str, last: str) -> str:
    return f"{first.strip().lower()}_{last.strip().lower()}".replace(" ", "")


def _allocate_unique_icons(
    db: Session, username: str, *, exclude: list[str] | None = None
) -> list[str]:
    """Pick an icon key free for this name.

    Scoped to `username` because that is what the database actually enforces
    (uq_users_username_icons) and what sign-in actually checks — auth_user
    resolves the name first, then verifies the credential against the accounts
    carrying it. Searching globally instead would run the 132 ordered pairs out
    at 132 members across every agency, and start refusing to open accounts it
    had no reason to refuse.

    `exclude` keeps a re-issued key from coming back as the one the member
    already could not use.
    """
    excluded = [list(exclude)] if exclude else []
    for _ in range(50):
        icons = random_icon_set()
        if icons in excluded:
            continue
        taken = (
            db.query(User)
            .filter(User.username == username, User.icons == icons)
            .first()
        )
        if not taken:
            return icons
    raise HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "Could not allocate a unique icon set — expand the icon pool.",
    )


# ---------- Community members (icon auth) ----------


@router.post("/signup/user", status_code=status.HTTP_201_CREATED)
def signup_user(body: UserSignup, response: Response, db: Session = Depends(get_db)):
    using_custom = bool(body.custom_password)
    username = _make_username(body.first_name, body.last_name)

    if body.icons is not None:
        try:
            icons = validate_icon_selection(body.icons)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    else:
        icons = _allocate_unique_icons(db, username)

    password = body.custom_password or credential(username, icons)

    user = User(
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip(),
        username=username,
        password_hash=hash_password(password),
        auth_type="password" if using_custom else "icon",
        icons=icons,
        accessibility_prefs=body.accessibility_prefs,
        interest_categories=body.interest_categories,
    )
    db.add(user)
    try:
        # Unique on (username, icons): a clash needs the same name AND the same
        # ordered icon selection.
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "That name and icon combination is already taken — pick a different "
            "set of icons.",
        )
    db.refresh(user)

    _sign_in_member(response, user)
    # Return the icons so the FE can show the member their login credentials.
    # Prefs are intentionally omitted here — the wizard re-reads GET /users/me.
    return {
        "id": str(user.id),
        "username": user.username,
        "icons": user.icons,
        "auth_type": user.auth_type,
    }


@router.post("/login/user")
def login_user(
    body: UserLogin,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    username = body.username.strip().lower()
    ip_key = client_key(request)
    id_key = f"user:{username}"
    enforce_rate_limit(db, {id_key: IDENTITY_LIMIT, ip_key: IP_LIMIT})

    # Usernames are not unique, so check the password against every match.
    candidates = (
        db.query(User)
        .filter(User.username == username, User.deleted_at.is_(None))
        .all()
    )
    for user in candidates:
        if verify_password(body.password, user.password_hash):
            clear_rate_limit(db, id_key)
            _sign_in_member(response, user)
            return {"id": str(user.id), "username": user.username, "role": "user"}
    record(db, id_key, ip_key)
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")


@router.post("/user")
def auth_user(
    body: UserAuth,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Unified member entry. If the name + icon key matches an existing account,
    log in; otherwise create a new account. Returns `mode` — "login", "signup",
    or "conflict" (the name exists but the icons don't match) — so the UI can
    show the right text."""
    try:
        icons = validate_icon_selection(body.icons)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))

    username = _make_username(body.first_name, body.last_name)
    password = credential(username, icons)

    ip_key = client_key(request)
    id_key = f"user:{username}"
    enforce_rate_limit(db, {id_key: IDENTITY_LIMIT, ip_key: IP_LIMIT})

    # 1) Existing record? The key is name + icons, so verify the credential
    #    against each same-named account (usernames alone aren't unique).
    # Archived members stay in `same_name` — they still hold their
    # (username, icons) slot, so the conflict check below has to see them — but
    # they can't sign in.
    same_name = db.query(User).filter(User.username == username).all()
    for user in same_name:
        if user.deleted_at is not None:
            continue
        if user.auth_type == "icon" and verify_password(
            password, user.password_hash
        ):
            clear_rate_limit(db, id_key)
            _sign_in_member(response, user)
            return {
                "mode": "login",
                "id": str(user.id),
                "username": user.username,
                "icons": user.icons,
            }

    # 2) No credential match, but somebody already signs in under this name. The
    #    overwhelmingly likely explanation is a mistapped icon, not a second
    #    person who happens to share the name — and creating an account here
    #    silently strands the member's saved programs in the account they
    #    actually own, while the UI congratulates them. Memory is a stated top
    #    barrier for these members, so mistaps are expected, not exceptional.
    #    Hand the decision back to the UI; `create_new` is the confirmed override.
    #    Note this counts same-named custom-password accounts too, where a
    #    mistap can't be the explanation. Unreachable today (nothing calls
    #    /auth/signup/user with a custom_password); revisit if that route is
    #    ever wired up.
    if same_name and not body.create_new:
        # A wrong icon key against a name that exists is exactly the signal a
        # brute-force sweep produces, so it counts against the budget.
        record(db, id_key, ip_key)
        return {"mode": "conflict"}

    # 3) Fresh (name + icons) → create the account. Different people may share
    #    the same icons as long as their names differ; a clash needs both.
    user = User(
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip(),
        username=username,
        password_hash=hash_password(password),
        auth_type="icon",
        icons=icons,
        accessibility_prefs=body.accessibility_prefs,
        interest_categories=body.interest_categories,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "That name and icon combination is already taken — pick a different "
            "set of icons.",
        )
    db.refresh(user)
    _sign_in_member(response, user)
    return {
        "mode": "signup",
        "id": str(user.id),
        "username": user.username,
        "icons": user.icons,
    }


# ---------- Hosts / admins (email + password) ----------


# There is deliberately no host signup route. Organizer accounts are created by
# a superadmin via POST /hosts — self-serve registration would have let anyone
# on the internet publish programs to the member feed.


@router.post("/login/host")
def login_host(
    body: HostLogin,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    email = body.email.strip().lower()
    ip_key = client_key(request)
    id_key = f"host:{email}"
    enforce_rate_limit(db, {id_key: IDENTITY_LIMIT, ip_key: IP_LIMIT})

    host = db.query(Host).filter(Host.email == email).first()
    if not host or not verify_password(body.password, host.password_hash):
        record(db, id_key, ip_key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    clear_rate_limit(db, id_key)
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
    role = payload.get("role")
    is_admin = payload.get("is_admin", False)
    if role == "user":
        # Same reasoning as the host branch below: the token outlives the
        # account. Without this an archived member's session still reports
        # authenticated here, so the UI lets them in and every real endpoint
        # then 401s.
        user = db.get(User, uuid.UUID(payload["sub"]))
        if not user or user.deleted_at is not None:
            return {"authenticated": False}
        # And the same again for a re-issued key: this is the gate the UI reads,
        # so it has to agree with deps._key_still_current or the member is shown
        # a signed-in app in which nothing works.
        if payload.get("cv") != credential_fingerprint(user.password_hash):
            return {"authenticated": False}
    if role == "host":
        # Tokens last a week and carry whatever is_admin was true at login, so a
        # demoted superadmin would keep seeing superadmin UI until it expired.
        # The DB is the authority (require_admin already reads it) — read it here
        # too so the UI matches what the API will actually allow.
        host = db.get(Host, uuid.UUID(payload["sub"]))
        if not host:
            return {"authenticated": False}
        is_admin = host.is_admin
    return {
        "authenticated": True,
        "role": role,
        "is_admin": is_admin,
        "id": payload.get("sub"),
    }
