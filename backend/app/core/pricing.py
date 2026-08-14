"""What a program costs, in shapes the real data actually uses.

The test sheet prices things four ways: nothing, whatever you can give, a fee
per session, a fee for a group, and one fee covering a run of sessions. A
single number can express none of them, and "$40 per 8-week season" carries a
commitment a number can't: paying once covers eight dates.

Anything the templates don't fit goes in `custom` with the agency's own wording
kept verbatim, because a made-up structure is worse than plain text.
"""

MODELS = {"free", "donation", "per_session", "per_group", "series", "custom"}


class PricingError(ValueError):
    """The pricing fields don't describe a coherent price."""


def validate(
    model: str,
    price_cents: int | None,
    group_size: int | None,
    sessions: int | None,
    note: str | None,
) -> None:
    if model not in MODELS:
        raise PricingError(f"Unknown pricing model: {model}")
    if model in ("free", "donation"):
        return
    if model == "custom":
        if not (note or "").strip():
            raise PricingError("Describe the cost, since it isn't one of the usual shapes.")
        return
    if price_cents is None or price_cents <= 0:
        raise PricingError("A paid program needs an amount.")
    if model == "per_group" and (group_size is None or group_size < 2):
        raise PricingError("A group price needs how many people it covers.")
    if model == "series" and (sessions is None or sessions < 2):
        raise PricingError("A series price needs how many sessions it covers.")


def money(cents: int | None) -> str:
    if cents is None:
        return ""
    return f"${cents / 100:,.2f}".replace(".00", "")


def describe(
    model: str,
    price_cents: int | None,
    group_size: int | None,
    sessions: int | None,
    note: str | None,
) -> str:
    """One line a member can read, built from the structure."""
    if model == "free":
        return "Free"
    if model == "donation":
        return "Free — donations welcome"
    if model == "custom":
        return (note or "").strip()
    amount = money(price_cents)
    if model == "per_session":
        return f"{amount} per session"
    if model == "per_group":
        return f"{amount} for {group_size} people"
    if model == "series":
        return f"{amount} for all {sessions} sessions"
    return amount


def covers_whole_series(model: str) -> bool:
    """Whether paying once should sign the member up for every date.

    This is the point of separating `series` from `per_session`: somebody who
    paid for an eight-week course is enrolled in eight dates, and making them
    save each one individually would be busywork that also loses the meaning.
    """
    return model == "series"
