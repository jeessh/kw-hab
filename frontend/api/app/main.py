from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.session import Base, engine

# Import models so metadata is populated before create_all.
import app.models  # noqa: F401
from app.api.routes import attendance, auth, events, hosts, users

app = FastAPI(title="KW Community Compass API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,  # required so the auth cookie is sent/received
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    # Convenience for the hackathon; use Alembic migrations for anything real.
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(hosts.router)
app.include_router(events.router)
app.include_router(attendance.router)
