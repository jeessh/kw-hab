from pydantic import BaseModel, EmailStr, Field


class UserSignup(BaseModel):
    first_name: str
    last_name: str
    # The member's chosen, ordered 3-icon key. If omitted, the server allocates
    # a random unique set (legacy behaviour).
    icons: list[str] | None = None
    # Optional custom password. If omitted, the icon password is used by default.
    custom_password: str | None = Field(None, min_length=8)
    # Onboarding prefs (free-form slugs from the FE chip taxonomy). Optional so
    # the plain signup path keeps working; default to empty, never null.
    accessibility_prefs: list[str] = []
    interest_categories: list[str] = []


class UserAuth(BaseModel):
    """Unified member entry: log in if the name + icon key matches an existing
    account, otherwise create it. The 3-icon set is the credential."""

    first_name: str
    last_name: str
    icons: list[str]
    # Applied only when a new account is created (ignored on login).
    accessibility_prefs: list[str] = []
    interest_categories: list[str] = []


class UserLogin(BaseModel):
    username: str
    # Either the icon password ("tree_cat_apple") or the custom password.
    password: str


class HostSignup(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8)


class HostLogin(BaseModel):
    # Plain str on login: it's a lookup key, and validating here could lock out
    # accounts created before EmailStr was enforced on signup.
    email: str
    password: str
