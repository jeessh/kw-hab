import hashlib
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings


def _to_bytes(password: str) -> bytes:
    # bcrypt only considers the first 72 bytes; truncate so long inputs don't
    # raise instead of hashing.
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_to_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_to_bytes(password), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def credential_fingerprint(password_hash: str) -> str:
    """A short, non-reversible tag for the credential a token was issued
    against.

    Carried in the token as `cv` and re-checked on every request, so changing
    somebody's credential ends the sessions opened with the old one. The bcrypt
    hash never leaves the server — this is a digest of a digest, and it only
    ever gets compared with one computed the same way.
    """
    return hashlib.sha256(password_hash.encode("utf-8")).hexdigest()[:16]


def create_access_token(
    sub: str,
    role: str,
    is_admin: bool = False,
    cred_hash: str | None = None,
) -> str:
    """role is 'user' or 'host'. Admins are hosts with is_admin=True.

    `cred_hash` binds the token to the credential in force when it was issued —
    see credential_fingerprint. Member tokens always carry it.
    """
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": str(sub), "role": role, "is_admin": is_admin, "exp": expire}
    if cred_hash is not None:
        payload["cv"] = cred_hash
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
    except JWTError:
        return None
