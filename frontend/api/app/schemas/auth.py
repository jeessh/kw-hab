from pydantic import BaseModel


class UserSignup(BaseModel):
    first_name: str
    last_name: str
    # Optional custom password. If omitted, the icon password is used by default.
    custom_password: str | None = None


class UserLogin(BaseModel):
    username: str
    # Either the icon password ("tree_cat_apple") or the custom password.
    password: str


class HostSignup(BaseModel):
    name: str
    email: str
    password: str


class HostLogin(BaseModel):
    email: str
    password: str
