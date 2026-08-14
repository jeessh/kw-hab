import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_admin
from app.models.host import Host
from app.models.user import User
from app.schemas.user import UserCreate, UserOut, UserPrefsUpdate, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(
    body: UserPrefsUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """A member updates their own preferences (voice/accessibility/interests).
    Defined before /{user_id} so the literal path wins the match."""
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


# ---------- Admin-only account management ----------


@router.get("", response_model=list[UserOut])
def list_users(
    _: Host = Depends(require_admin), db: Session = Depends(get_db)
):
    return (
        db.query(User)
        .filter(User.deleted_at.is_(None))
        .order_by(User.created_at.desc())
        .all()
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    _: Host = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a member account on someone's behalf.

    Deliberately does NOT set an auth cookie: the caller is a superadmin doing
    admin work, and signing them in as the new member would end their session.
    """
    from app.api.routes.auth import _allocate_unique_icons, _make_username
    from app.core.icons import credential, validate_icon_selection
    from app.core.security import hash_password

    username = _make_username(body.first_name, body.last_name)
    if body.icons is not None:
        try:
            icons = validate_icon_selection(body.icons)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    else:
        icons = _allocate_unique_icons(db)

    user = User(
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip(),
        username=username,
        password_hash=hash_password(credential(username, icons)),
        auth_type="icon",
        icons=icons,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "That name and icon combination is already taken.",
        )
    db.refresh(user)
    # Icons are the password and can't be read back later — return them once so
    # they can be handed over.
    return {
        "id": str(user.id),
        "first_name": user.first_name,
        "last_name": user.last_name,
        "icons": user.icons,
    }


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    _: Host = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from app.api.routes.auth import _make_username
    from app.core.icons import credential
    from app.core.security import hash_password

    user = db.get(User, user_id)
    if not user or user.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)

    # The name is half the credential. Sign-in derives both the lookup key and
    # the password from it (see auth_user), so changing a name without
    # recomputing them locks the member out of their own account — they type
    # the corrected name, it resolves to a username no row has, and they are
    # treated as a stranger with their saved programs stranded. Fixing a typo
    # must not cost somebody their account.
    username = _make_username(user.first_name, user.last_name)
    if username != user.username:
        if user.auth_type != "icon":
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "This account signs in with a password; renaming it would "
                "lock it out.",
            )
        user.username = username
        user.password_hash = hash_password(credential(username, user.icons))

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Another member already uses that name with the same icons.",
        )
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: uuid.UUID,
    _: Host = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Archive the member. They can no longer sign in, but their attendance
    rows stay, so the programs they attended keep the numbers they already
    reported. The (username, icons) key stays claimed too — nobody should be
    able to sign in and land in an archived member's history.

    There is deliberately no un-archive route yet; if one is needed, it belongs
    with the rest of member management rather than bolted onto DELETE.
    """
    user = db.get(User, user_id)
    if not user or user.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user.deleted_at = func.now()
    db.commit()
