from pydantic import BaseModel, Field


class UserSignup(BaseModel):
    first_name: str
    last_name: str
    # The member's chosen, ordered icon key (ICON_COUNT of them). If omitted,
    # the server allocates a free set (legacy behaviour).
    icons: list[str] | None = None
    # Optional custom password. If omitted, the icon password is used by default.
    custom_password: str | None = Field(None, min_length=8)
    # Onboarding prefs (free-form slugs from the FE chip taxonomy). Optional so
    # the plain signup path keeps working; default to empty, never null.
    accessibility_prefs: list[str] = []
    interest_categories: list[str] = []


class UserAuth(BaseModel):
    """Unified member entry: log in if the name + icon key matches an existing
    account, otherwise create it. The icon set is the credential."""

    first_name: str
    last_name: str
    icons: list[str]
    # Set only after the member has been told the name is already in use and has
    # confirmed they are someone else. Without it, a name that already exists
    # plus non-matching icons is treated as a mistap, not a new person — see
    # auth_user. Names are deliberately not unique, so this escape hatch has to
    # exist; it just must not be the default.
    create_new: bool = False
    # Applied only when a new account is created (ignored on login).
    accessibility_prefs: list[str] = []
    interest_categories: list[str] = []


class UserLogin(BaseModel):
    username: str
    # Either the icon password ("tree_cat_apple") or the custom password.
    password: str


class HostLogin(BaseModel):
    # Plain str on login: it's a lookup key, and validating here could lock out
    # accounts created before EmailStr was enforced on signup.
    email: str
    password: str


class HostForgot(BaseModel):
    # Plain str, matching HostLogin and for the same reason: accounts predating
    # EmailStr on signup would be rejected here before the lookup ever ran. An
    # organizer who can't sign in because of a legacy address is precisely who
    # this endpoint exists for, so refusing to look them up defeats it.
    email: str


class HostReset(BaseModel):
    token: str
    password: str = Field(min_length=8)
