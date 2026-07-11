from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings

# NullPool + no prepared statements so the same code works on Supabase's
# transaction pooler (pgbouncer, port 6543) that a serverless deploy needs —
# each invocation gets a fresh short-lived connection and pgbouncer does the
# pooling. Fine for local dev on the session pooler too.
_connect_args = {"prepare_threshold": None} if "+psycopg" in settings.DATABASE_URL else {}
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    poolclass=NullPool,
    connect_args=_connect_args,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass
