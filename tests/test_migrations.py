import os
from datetime import datetime

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text

from app.db import build_engine
from app.models import Base

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL")
requires_postgres = pytest.mark.skipif(not POSTGRES_URL, reason="TEST_POSTGRES_URL not set")


def _alembic_config(url: str) -> Config:
    config = Config("alembic.ini")
    config.attributes["database_url"] = url
    return config


@pytest.fixture(params=["sqlite", pytest.param("postgres", marks=requires_postgres)])
def database_url(request, tmp_path) -> str:
    if request.param == "sqlite":
        return f"sqlite:///{tmp_path / 'migrated.db'}"
    command.downgrade(_alembic_config(POSTGRES_URL), "base")
    return POSTGRES_URL


def test_migrations_produce_the_model_schema(database_url):
    config = _alembic_config(database_url)
    command.upgrade(config, "head")

    engine = build_engine(database_url)
    inspector = inspect(engine)
    assert set(inspector.get_table_names()) - {"alembic_version"} == set(Base.metadata.tables)
    for name, table in Base.metadata.tables.items():
        assert {c["name"] for c in inspector.get_columns(name)} == {c.name for c in table.columns}, name
        assert {i["name"] for i in inspector.get_indexes(name)} == {i.name for i in table.indexes}, name
    engine.dispose()

    command.downgrade(config, "base")
    engine = build_engine(database_url)
    assert set(inspect(engine).get_table_names()) == {"alembic_version"}
    engine.dispose()


@requires_postgres
def test_postgres_round_trips_defaults_and_types():
    config = _alembic_config(POSTGRES_URL)
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    engine = build_engine(POSTGRES_URL)
    try:
        with engine.begin() as conn:
            conn.execute(text(
                'INSERT INTO "Project" (id, slug, name, description, "updatedAt") '
                "VALUES ('p1', 'p1', 'Project', 'Description', CURRENT_TIMESTAMP)"
            ))
            row = conn.execute(text('SELECT "isFeatured", "displayOrder", "publicationState", "createdAt" FROM "Project"')).one()
        assert row.isFeatured is False
        assert row.displayOrder == 0
        assert row.publicationState == "DRAFT"
        assert isinstance(row.createdAt, datetime)
    finally:
        engine.dispose()
        command.downgrade(config, "base")
