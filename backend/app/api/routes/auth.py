import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

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
from app.core.mail import send as send_mail
from app.models.host import Host
from app.models.password_reset import HostPasswordReset
from app.models.user import User
from app.schemas.auth import (
    HostForgot,
    HostLogin,
    HostReset,
    UserAuth,
    UserLogin,
    UserSignup,
)

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

    host = (
        db.query(Host)
        .filter(Host.email == email, Host.deleted_at.is_(None))
        .first()
    )
    if not host or not verify_password(body.password, host.password_hash):
        record(db, id_key, ip_key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    clear_rate_limit(db, id_key)
    set_auth_cookie(
        response, create_access_token(
            host.id,
            "host",
            is_admin=host.is_admin,
            cred_hash=credential_fingerprint(host.password_hash),
        )
    )
    return {"id": str(host.id), "email": host.email, "is_admin": host.is_admin}


# ---------- Organizer password reset ----------
#
# The only way back into a locked-out organizer account used to be a superadmin
# setting a new password by hand — which left the sole superadmin, the one
# account guaranteed to exist, with no route back in at all.

RESET_TTL_MINUTES = 60
# Per address, per window. Low: this sends mail to somebody who did not
# necessarily ask for it, and five is already more than a real person needs.
FORGOT_LIMIT = 5


def _reset_hash(token: str) -> str:
    """SHA-256, as for invitations: 32 bytes of entropy has nothing to guess,
    so the slow hashing a password needs buys nothing here."""
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/host/forgot")
def forgot_host_password(
    body: HostForgot,
    request: Request,
    db: Session = Depends(get_db),
):
    """Send a reset link, if that address has an account.

    Answers identically whether or not it does, and whether or not the mail
    actually went out. Anything else turns this into a way to ask the platform
    which agencies are on it.
    """
    email = body.email.strip().lower()
    ip_key = f"{client_key(request)}:forgot"
    id_key = f"forgot:{email}"
    enforce_rate_limit(db, {id_key: FORGOT_LIMIT, ip_key: IP_LIMIT})
    # Every attempt counts, not just failures: the cost being metered here is
    # mail sent to somebody's inbox, and a request that finds a real account is
    # exactly the one worth limiting.
    record(db, id_key, ip_key)

    host = (
        db.query(Host)
        .filter(Host.email == email, Host.deleted_at.is_(None))
        .first()
    )
    if host:
        token = secrets.token_urlsafe(32)
        db.add(
            HostPasswordReset(
                token_hash=_reset_hash(token),
                host_id=host.id,
                expires_at=datetime.now(timezone.utc)
                + timedelta(minutes=RESET_TTL_MINUTES),
            )
        )
        db.commit()
        link = f"{settings.FRONTEND_ORIGIN}/host/reset/{token}"
        send_mail(
            host.email,
            "Reset your Belonging Collective password",
            f"""Hello {host.name},

Someone asked to reset the password for this organizer account.

Open this link to choose a new one. It works once, and expires in one hour:

{link}

If it wasn't you, nothing has changed — ignore this and your password stays
as it is.
""",
        )
    return {"sent": True}


def _usable_reset(db: Session, token: str) -> HostPasswordReset:
    reset = (
        db.query(HostPasswordReset)
        .filter(HostPasswordReset.token_hash == _reset_hash(token))
        .first()
    )
    if not reset or reset.used_at is not None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "That reset link is no longer valid."
        )
    if reset.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status.HTTP_410_GONE, "That reset link has expired — ask for a new one."
        )
    return reset


@router.get("/host/reset/{token}")
def preview_host_reset(token: str, db: Session = Depends(get_db)):
    """What the reset page shows before anyone types a password. Returns the
    address the link was issued for, so somebody holding two accounts can see
    which one they are about to change."""
    reset = _usable_reset(db, token)
    host = db.get(Host, reset.host_id)
    if not host or host.deleted_at is not None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "That reset link is no longer valid."
        )
    return {"email": host.email, "organization": host.name}


@router.post("/host/reset")
def reset_host_password(
    body: HostReset,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Set the new password and sign them straight in.

    Every other outstanding reset for the account is spent at the same time: if
    a few links were requested, the one that gets used is the only one that
    should ever work.
    """
    ip_key = f"{client_key(request)}:reset"
    enforce_rate_limit(db, {ip_key: IP_LIMIT})
    try:
        reset = _usable_reset(db, body.token)
    except HTTPException:
        record(db, ip_key)
        raise

    host = db.get(Host, reset.host_id)
    if not host or host.deleted_at is not None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "That reset link is no longer valid."
        )

    now = datetime.now(timezone.utc)
    host.password_hash = hash_password(body.password)
    db.query(HostPasswordReset).filter(
        HostPasswordReset.host_id == host.id,
        HostPasswordReset.used_at.is_(None),
    ).update({HostPasswordReset.used_at: now}, synchronize_session=False)
    db.commit()
    db.refresh(host)
    # Sessions opened with the old password stop working here, because the
    # token carries a fingerprint of it — which is the point when the reason
    # for the reset is that somebody else had it.
    set_auth_cookie(
        response,
        create_access_token(
            host.id,
            "host",
            is_admin=host.is_admin,
            cred_hash=credential_fingerprint(host.password_hash),
        ),
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
        # Archived too: get_current_host now refuses these, so reporting the
        # session as live here would hand a removed organizer a console in
        # which every request fails.
        if not host or host.deleted_at is not None:
            return {"authenticated": False}
        # And the same fingerprint check the API applies, so a reset organizer
        # isn't shown a console in which nothing works.
        if payload.get("cv") != credential_fingerprint(host.password_hash):
            return {"authenticated": False}
        is_admin = host.is_admin
    return {
        "authenticated": True,
        "role": role,
        "is_admin": is_admin,
        "id": payload.get("sub"),
    }
