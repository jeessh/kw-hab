"""Failure-counting rate limits for the auth endpoints.

The member credential is a name plus an ordered 3-icon key — roughly 59k
combinations. That is small enough to exhaust from a script, so the sign-in
routes need a ceiling on how fast someone can guess.

Two deliberate design choices:

* **Only failures count, and a success clears the counter.** A member who knows
  their icons is never locked out, no matter how much noise someone else is
  making against their name. It also means the identity budget can be small
  without ever getting in a real member's way.
* **The per-IP budget is generous.** Members frequently sign in from a shared
  facility — a community centre or a group home — so several people onboarding
  together legitimately share one address. A tight IP limit would lock out a
  whole room, which is exactly the population this platform exists to serve.
  The per-identity budget is what actually stops a targeted guess; the IP budget
  only stops someone sweeping across many names at once.
"""

from fastapi import HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

# Per name / email being signed in to.
IDENTITY_LIMIT = 10
# Per source address, across every auth route.
IP_LIMIT = 60
WINDOW_SECONDS = 15 * 60

_RETRY_MESSAGE = "Too many tries. Please wait a few minutes and try again."

_COUNT = text(
    """
    select attempts from auth_rate_limits
    where key = :key
      and window_start >= now() - (:window * interval '1 second')
    """
)

# One statement so concurrent requests can't both read a stale count and each
# decide they're under the limit.
_RECORD = text(
    """
    insert into auth_rate_limits (key, window_start, attempts)
    values (:key, now(), 1)
    on conflict (key) do update set
        attempts = case
            when auth_rate_limits.window_start
                 < now() - (:window * interval '1 second')
            then 1
            else auth_rate_limits.attempts + 1
        end,
        window_start = case
            when auth_rate_limits.window_start
                 < now() - (:window * interval '1 second')
            then now()
            else auth_rate_limits.window_start
        end
    returning attempts
    """
)


def client_key(request: Request) -> str:
    """Source address, trusting Vercel's proxy header when it's there."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    elif request.client:
        ip = request.client.host
    else:
        ip = "unknown"
    return f"ip:{ip}"


def enforce(db: Session, keys: dict[str, int]) -> None:
    """Reject the request if any `{key: limit}` is already spent.

    Checked before the credential work so a spent budget costs a lookup rather
    than a bcrypt verification.
    """
    for key, limit in keys.items():
        used = db.execute(
            _COUNT, {"key": key, "window": WINDOW_SECONDS}
        ).scalar()
        if used is not None and used >= limit:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS, _RETRY_MESSAGE
            )


def record_failure(db: Session, *keys: str) -> None:
    """Count one failed attempt against each key.

    Commits on its own: the request it belongs to is about to raise, and the
    attempt has to be recorded anyway or the limit never fills.
    """
    for key in keys:
        db.execute(_RECORD, {"key": key, "window": WINDOW_SECONDS})
    db.commit()


def clear(db: Session, *keys: str) -> None:
    """Forget the failures for these keys, after a successful sign-in."""
    for key in keys:
        db.execute(
            text("delete from auth_rate_limits where key = :key"), {"key": key}
        )
    db.commit()
