import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core import mail
from app.core.config import settings

# Import models so every mapper is configured before the first request.
import app.models  # noqa: F401
from app.api.routes import attendance, auth, events, hosts, invites, users

app = FastAPI(title="The Belonging Collective API", root_path=settings.ROOT_PATH)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,  # required so the auth cookie is sent/received
    allow_methods=["*"],
    allow_headers=["*"],
)


# The schema is owned by Alembic (`alembic upgrade head`), not by create_all on
# startup. create_all only ever emitted CREATE TABLE IF NOT EXISTS, so it
# silently did nothing for column changes — a new field worked locally and then
# 500'd every query in production against the un-ALTERed table.


# The password-reset fallback writes the reset link to the log instead of
# mailing it, which is right locally and a credential leak in production.
# COOKIE_SECURE is the closest thing to a "this is production" signal the
# settings have — it is what has to be true behind HTTPS — so warn on the
# combination rather than letting it pass unremarked.
if settings.COOKIE_SECURE and not mail.configured():
    logging.getLogger(__name__).warning(
        "COOKIE_SECURE is on but SMTP is not configured: organizer password "
        "reset will LOG reset links instead of sending them. Set SMTP_HOST and "
        "MAIL_FROM, or expect reset links in your logs."
    )


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(hosts.router)
app.include_router(events.router)
app.include_router(attendance.router)
app.include_router(invites.router)
