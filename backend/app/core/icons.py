import secrets

# Placeholder icon slugs. Swap/extend with your real icon set later.
# Members pick an ordered set of 3, so with 40 icons there are
# 40 * 39 * 38 = 59,280 unique combinations.
ICON_POOL = [
    "tree", "cat", "apple", "sun", "moon", "star",
    "dog", "fish", "bird", "leaf", "flower", "house",
    "car", "boat", "heart", "cloud", "rain", "snow",
    "fire", "key", "book", "ball", "cake", "bell",
    "guitar", "rocket", "crown", "gift", "camera", "clock",
    "umbrella", "balloon", "anchor", "diamond", "mushroom", "cactus",
    "grapes", "lemon", "pizza", "hat",
]

ICON_COUNT = 3


def random_icon_set() -> list[str]:
    """Return an ordered list of 3 distinct icon slugs.

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
        raise ValueError(f"Choose exactly {ICON_COUNT} icons.")
    if len(set(icons)) != ICON_COUNT:
        raise ValueError("Choose 3 different icons.")
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
