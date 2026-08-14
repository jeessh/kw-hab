from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

# Import models so every mapper is configured before the first request.
import app.models  # noqa: F401
from app.api.routes import attendance, auth, events, hosts, invites, users

app = FastAPI(title="KW Community Compass API", root_path=settings.ROOT_PATH)

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


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(hosts.router)
app.include_router(events.router)
app.include_router(attendance.router)
app.include_router(invites.router)
