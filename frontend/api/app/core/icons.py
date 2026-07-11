import secrets

# Placeholder icon slugs. Swap/extend with your real icon set later.
# With 24 icons and 3 ordered picks there are 24*23*22 = 12,144 unique combos.
ICON_POOL = [
    "tree", "cat", "apple", "sun", "moon", "star",
    "dog", "fish", "bird", "leaf", "flower", "house",
    "car", "boat", "heart", "cloud", "rain", "snow",
    "fire", "key", "book", "ball", "cake", "bell",
]

ICON_COUNT = 3


def random_icon_set() -> list[str]:
    """Return an ordered list of 3 distinct icon slugs.

    The icon set is effectively the member's password, so draw it from a CSPRNG
    (secrets) rather than the Mersenne-Twister default in `random`.
    """
    pool = list(ICON_POOL)
    return [pool.pop(secrets.randbelow(len(pool))) for _ in range(ICON_COUNT)]


def icons_to_password(icons: list[str]) -> str:
    """The default password is the icon slugs joined: 'tree_cat_apple'."""
    return "_".join(icons)
