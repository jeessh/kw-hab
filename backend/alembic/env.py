from logging.config import fileConfig

from alembic import context

from app.core.config import settings
from app.db.session import Base, engine

# Importing the models package is what populates Base.metadata — without it
# autogenerate sees an empty schema and proposes dropping every table.
import app.models  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # Reuse the app's engine rather than building one from alembic.ini: it
    # already carries the NullPool + prepare_threshold=None settings that make
    # connections work through Supabase's pgbouncer pooler, and it reads the URL
    # from .env so a password containing '%' can't be mangled by configparser
    # interpolation.
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
