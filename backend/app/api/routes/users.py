import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_admin
from app.models.host import Host
from app.models.user import User
from app.schemas.user import UserOut, UserPrefsUpdate, UserUpdate

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


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    _: Host = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user or user.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
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
