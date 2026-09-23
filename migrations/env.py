"""Alembic environment: migrates the database named by DATABASE_URL."""

from __future__ import annotations

import os

from alembic import context

from app.db import DEFAULT_DATABASE_URL, build_engine
from app.models import Base

target_metadata = Base.metadata


def _url() -> str:
    return context.config.attributes.get("database_url") or os.environ.get("DATABASE_URL") or DEFAULT_DATABASE_URL


def run_migrations_offline() -> None:
    from app.db import normalize_database_url

    context.configure(url=normalize_database_url(_url()), target_metadata=target_metadata, literal_binds=True, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = build_engine(_url())
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=connection.dialect.name == "sqlite")
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
