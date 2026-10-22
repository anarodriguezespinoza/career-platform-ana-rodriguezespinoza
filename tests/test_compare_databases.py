from sqlalchemy import text

from app.compare_databases import compare_databases, main
from app.copy_database import copy_database
from app.db import build_engine
from tests.test_copy_database import _empty_sqlite, source_url  # noqa: F401 - fixture


def _by_table(results):
    return {r.table: r for r in results}


def test_copy_matches_source_row_for_row(source_url, tmp_path, capsys):  # noqa: F811
    target_url = _empty_sqlite(tmp_path / "target.db")
    copy_database(source_url, target_url)

    inquiries = _by_table(compare_databases(source_url, target_url))["ContactInquiry"]
    assert (inquiries.source, inquiries.target, inquiries.matched, inquiries.changed, inquiries.missing) == (2, 2, 2, 0, 0)
    assert main([source_url, target_url]) == 0
    out = capsys.readouterr().out
    assert "ContactInquiry | 2 | 2 | 2 | 0 | 0 | 0" in out
    assert "name@example.com" not in out


def test_reports_changed_missing_and_extra_rows(source_url, tmp_path):  # noqa: F811
    target_url = _empty_sqlite(tmp_path / "target.db")
    copy_database(source_url, target_url)
    engine = build_engine(target_url)
    with engine.begin() as conn:
        conn.execute(text('UPDATE "ContactInquiry" SET status = \'ARCHIVED\' WHERE id = \'inquiry-int\''))
        conn.execute(text('DELETE FROM "ContactInquiry" WHERE id = \'inquiry-text\''))
        conn.execute(text(
            'INSERT INTO "Skill" (id, name, category, "displayOrder", "publicationState", "createdAt", "updatedAt") '
            "VALUES ('skill-new', 'SQL', 'Languages', 0, 'PUBLISHED', '2026-10-21 00:00:00', '2026-10-21 00:00:00')"
        ))
    engine.dispose()

    results = _by_table(compare_databases(source_url, target_url))
    assert (results["ContactInquiry"].changed, results["ContactInquiry"].missing) == (1, 1)
    assert results["Skill"].extra == 1
    assert main([source_url, target_url]) == 2
