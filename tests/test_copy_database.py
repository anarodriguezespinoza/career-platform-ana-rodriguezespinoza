import os
from datetime import datetime

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models
from app.copy_database import TargetNotEmptyError, coerce_timestamp, copy_database, main
from app.db import build_engine

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL")

PRISMA_MILLISECONDS = 1790113211732
PRISMA_DATETIME = datetime(2026, 9, 22, 21, 40, 11, 732000)
TEXT_TIMESTAMP = "2026-10-04 21:22:17.867220"
TEXT_DATETIME = datetime(2026, 10, 4, 21, 22, 17, 867220)

EXPECTED_COUNTS = {"Profile": 0, "Experience": 0, "Project": 1, "ProjectTechnology": 1, "Skill": 0, "ResumeSettings": 0, "ContactInquiry": 2}


def _empty_sqlite(path) -> str:
    url = f"sqlite:///{path}"
    engine = build_engine(url)
    models.Base.metadata.create_all(engine)
    engine.dispose()
    return url


@pytest.fixture
def source_url(tmp_path) -> str:
    url = _empty_sqlite(tmp_path / "source.db")
    engine = build_engine(url)
    inquiry = (
        'INSERT INTO "ContactInquiry" (id, name, email, message, "opportunityType", source, "privateNotes", status, '
        '"notificationStatus", "createdAt", "updatedAt") '
        "VALUES (:id, 'Name', 'name@example.com', 'Message', 'OTHER', 'contact-form', '', 'NEW', 'FAILED', :ts, :ts)"
    )
    with engine.begin() as conn:
        conn.execute(text(inquiry), {"id": "inquiry-int", "ts": PRISMA_MILLISECONDS})
        conn.execute(text(inquiry), {"id": "inquiry-text", "ts": TEXT_TIMESTAMP})
        conn.execute(text(
            'INSERT INTO "Project" (id, slug, name, description, "isFeatured", "displayOrder", "publicationState", "createdAt", "updatedAt") '
            "VALUES ('project-1', 'project-1', 'Project', 'Description', 1, 0, 'PUBLISHED', :ts, :ts)"
        ), {"ts": TEXT_TIMESTAMP})
        conn.execute(text('INSERT INTO "ProjectTechnology" ("projectId", technology, "displayOrder") VALUES (\'project-1\', \'Python\', 0)'))
    engine.dispose()
    return url


def test_coerce_timestamp_reads_prisma_milliseconds():
    assert coerce_timestamp(PRISMA_MILLISECONDS) == PRISMA_DATETIME


def test_coerce_timestamp_reads_sqlalchemy_text():
    assert coerce_timestamp(TEXT_TIMESTAMP) == TEXT_DATETIME


def test_coerce_timestamp_passes_none_through():
    assert coerce_timestamp(None) is None


def test_copy_database_converts_mixed_rows(source_url, tmp_path):
    target_url = _empty_sqlite(tmp_path / "target.db")

    assert copy_database(source_url, target_url) == EXPECTED_COUNTS

    engine = build_engine(target_url)
    with Session(engine) as session:
        inquiries = {i.id: i.created_at for i in session.scalars(select(models.ContactInquiry))}
        project = session.get(models.Project, "project-1")
        assert inquiries == {"inquiry-int": PRISMA_DATETIME, "inquiry-text": TEXT_DATETIME}
        assert project.is_featured is True
        assert [t.technology for t in project.technologies] == ["Python"]
    engine.dispose()


def test_copy_database_refuses_non_empty_target(source_url, tmp_path):
    target_url = _empty_sqlite(tmp_path / "target.db")
    engine = build_engine(target_url)
    with Session(engine) as session:
        session.add(models.Skill(id="skill-1", name="Python", category="Languages"))
        session.commit()

    with pytest.raises(TargetNotEmptyError, match="Skill"):
        copy_database(source_url, target_url)

    with Session(engine) as session:
        assert session.scalar(select(func.count()).select_from(models.ContactInquiry)) == 0
    engine.dispose()


def test_copy_failure_does_not_reveal_inquiry_contents(tmp_path, capsys):
    source_url = f"sqlite:///{tmp_path / 'loose.db'}"
    engine = build_engine(source_url)
    models.Base.metadata.create_all(engine, tables=[t for t in models.Base.metadata.sorted_tables if t.name != "ContactInquiry"])
    with engine.begin() as conn:
        columns = ", ".join(f'"{c.name}"' for c in models.ContactInquiry.__table__.columns)
        conn.execute(text(f'CREATE TABLE "ContactInquiry" ({columns})'))
        conn.execute(text(
            'INSERT INTO "ContactInquiry" (id, name, email, message, "opportunityType", source, "privateNotes", status, "notificationStatus", "createdAt") '
            "VALUES ('i1', 'Secret Person', 'secret@example.com', 'SECRET MESSAGE', 'OTHER', 'contact-form', '', 'NEW', 'FAILED', :ts)"
        ), {"ts": TEXT_TIMESTAMP})
    engine.dispose()
    target_url = _empty_sqlite(tmp_path / "target.db")

    with pytest.raises(IntegrityError) as error:
        copy_database(source_url, target_url)
    assert "secret@example.com" not in str(error.value)

    assert main([source_url, target_url]) == 1
    captured = capsys.readouterr()
    assert "IntegrityError" in captured.err
    for secret in ("Secret Person", "secret@example.com", "SECRET MESSAGE"):
        assert secret not in captured.out + captured.err


@pytest.mark.skipif(not POSTGRES_URL, reason="TEST_POSTGRES_URL not set")
def test_copy_database_into_postgres(source_url):
    config = Config("alembic.ini")
    config.attributes["database_url"] = POSTGRES_URL
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    try:
        assert copy_database(source_url, POSTGRES_URL) == EXPECTED_COUNTS
        engine = build_engine(POSTGRES_URL)
        with Session(engine) as session:
            assert session.get(models.ContactInquiry, "inquiry-int").created_at == PRISMA_DATETIME
            assert session.get(models.Project, "project-1").is_featured is True
        engine.dispose()
    finally:
        command.downgrade(config, "base")
