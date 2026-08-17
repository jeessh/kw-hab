import secrets

# The twelve icons a member can choose from.
#
# Deliberately small and deliberately distinct — no two that could be confused
# at a glance or described by the same word. This is a key someone has to
# recognise, not read.
ICON_POOL = [
    "tree", "cat", "apple", "sun", "moon", "dog",
    "fish", "flower", "house", "car", "heart", "star",
]

# Two icons, picked one at a time.
#
# Ordered, so it is 12 x 11 = 132 combinations per name rather than 66. Still
# small, and still a knowing trade: someone who knows a member's name is a few
# dozen guesses from their account, and the rate limiter in core/rate_limit.py
# is what stands in the way. Two is the compromise between that and asking
# people to remember a sequence — which is the barrier this door exists to
# remove.

ICON_COUNT = 2


def random_icon_set() -> list[str]:
    """Return the member's icon key, as a list.

    The icon set is effectively the member's password, so draw it from a CSPRNG
    (secrets) rather than the Mersenne-Twister default in `random`.
    """
    pool = list(ICON_POOL)
    return [pool.pop(secrets.randbelow(len(pool))) for _ in range(ICON_COUNT)]


def validate_icon_selection(icons: list[str]) -> list[str]:
    """Validate a member's chosen icons and return them in the tapped order.

    Order is preserved because the sequence is part of the credential.
    Raises ValueError with a member-friendly message on any problem.
    """
    if len(icons) != ICON_COUNT:
        raise ValueError(
            "Choose your icon." if ICON_COUNT == 1
            else f"Choose exactly {ICON_COUNT} icons."
        )
    if len(set(icons)) != ICON_COUNT:
        raise ValueError("Choose different icons.")
    unknown = [c for c in icons if c not in ICON_POOL]
    if unknown:
        raise ValueError(f"Unknown icons: {', '.join(unknown)}")
    return list(icons)


def icons_to_password(icons: list[str]) -> str:
    """The icon portion of the key, slugs joined: 'tree_cat_apple'."""
    return "_".join(icons)


def credential(username: str, icons: list[str]) -> str:
    """A member's sign-in key = their name (username) PLUS the ordered icons.

    Because the name is part of the key, identical icons under a different name
    are a different credential — so a collision requires BOTH the full name and
    the icon selection to match (uniqueness is on username + icons).
    """
    return f"{username}::{icons_to_password(icons)}"
