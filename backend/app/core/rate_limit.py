"""Failure-counting rate limits for the auth endpoints.

The member credential is a name plus an ordered icon key — with ICON_COUNT at
two, 132 combinations for a given name. That is small enough to exhaust from a
script in seconds, so the sign-in routes need a ceiling on how fast someone can
guess, and this file is what stands between the icon door and a sweep.

Two deliberate design choices:

* **Only failures count, and a success clears that identity's counter.** A
  member who knows their icons is never locked out, no matter how much noise
  someone else is making against their name. It also means the identity budget
  can be small without ever getting in a real member's way.
* **Success does NOT clear the IP counter.** Only the identity key is cleared.
  Signing in successfully proves you hold one credential; it says nothing about
  the other names being tried from the same address. Clearing the shared IP
  bucket on success would let anyone with a single valid account — including one
  they just created, since account creation is unthrottled — reset the sweep
  protection at will by logging in periodically.
* **The per-IP budget is generous.** Members frequently sign in from a shared
  facility — a community centre or a group home — so several people onboarding
  together legitimately share one address, and mistaps are expected rather than
  exceptional. A tight IP limit would lock out a whole room, which is exactly
  the population this platform exists to serve. Since the IP bucket now only
  drains by expiry, it is set high enough that a real session can't reach it.
  That costs little: the per-identity budget is what stops a targeted guess, and
  it stays at 10 regardless of how much room the IP budget has. The IP limit's
  only job is to make sweeping across many names at once impractical.
"""

from fastapi import HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

# Per name / email being signed in to. Cleared on a successful sign-in.
IDENTITY_LIMIT = 10
# Per source address, across every auth route. Only ever drains by expiry, so
# it has to clear a whole facility's worth of honest mistakes in one window.
IP_LIMIT = 200
# Outbound registration-link clicks per address. These feed the numbers
# nonprofits put in grant applications, so the endpoint being public and
# append-only makes inflating them cheap; this is a floor on that, not a
# solution. Set well above what a room of members browsing could produce.
CLICK_LIMIT = 300
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


def record(db: Session, *keys: str) -> None:
    """Count one attempt against each key.

    Commits on its own: the request it belongs to is about to raise, and the
    attempt has to be recorded anyway or the limit never fills.
    """
    for key in keys:
        db.execute(_RECORD, {"key": key, "window": WINDOW_SECONDS})
    db.commit()


def clear(db: Session, *keys: str) -> None:
    """Forget the failures for these keys, after a successful sign-in.

    Pass the identity key only — see the module docstring on why a success must
    not drain the shared IP bucket.
    """
    for key in keys:
        db.execute(
            text("delete from auth_rate_limits where key = :key"), {"key": key}
        )
    db.commit()
