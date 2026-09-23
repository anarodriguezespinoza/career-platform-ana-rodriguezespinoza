from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.models import Base


def test_migrations_produce_the_model_schema(tmp_path):
    url = f"sqlite:///{tmp_path / 'migrated.db'}"
    config = Config("alembic.ini")
    config.attributes["database_url"] = url
    command.upgrade(config, "head")

    inspector = inspect(create_engine(url))
    assert set(inspector.get_table_names()) - {"alembic_version"} == set(Base.metadata.tables)
    for name, table in Base.metadata.tables.items():
        assert {c["name"] for c in inspector.get_columns(name)} == {c.name for c in table.columns}, name
        assert {i["name"] for i in inspector.get_indexes(name)} == {i.name for i in table.indexes}, name

    command.downgrade(config, "base")
    assert set(inspect(create_engine(url)).get_table_names()) == {"alembic_version"}
