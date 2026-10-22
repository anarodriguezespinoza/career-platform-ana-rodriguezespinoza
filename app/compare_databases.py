"""Compare every model table between a source and a target database, row by row.

Usage: python -m app.compare_databases SOURCE_URL TARGET_URL

Rows are matched by primary key and compared on every model column after the same
conversions the copy tool applies, so a re-seeded target can't pass as a copy.
Only counts are printed, never row contents.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from typing import Any

from sqlalchemy import Table, text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import SQLAlchemyError

from app.copy_database import _convert
from app.db import build_engine
from app.models import Base


@dataclass(frozen=True)
class TableComparison:
    table: str
    source: int
    target: int
    matched: int
    changed: int
    missing: int
    extra: int


def _rows(connection: Connection, table: Table) -> dict[tuple[Any, ...], tuple[Any, ...]]:
    keys = [c.name for c in table.primary_key.columns]
    rows = {}
    for row in connection.execute(text(f'SELECT * FROM "{table.name}"')).mappings():
        converted = {c.name: _convert(c, row[c.name]) for c in table.columns}
        rows[tuple(converted[k] for k in keys)] = tuple(converted[c.name] for c in table.columns)
    return rows


def compare_databases(source_url: str, target_url: str) -> list[TableComparison]:
    source = build_engine(source_url, hide_parameters=True)
    target = build_engine(target_url, hide_parameters=True)
    results = []
    try:
        with source.connect() as reader, target.connect() as other:
            for table in Base.metadata.sorted_tables:
                before, after = _rows(reader, table), _rows(other, table)
                shared = before.keys() & after.keys()
                matched = sum(1 for key in shared if before[key] == after[key])
                results.append(TableComparison(
                    table=table.name,
                    source=len(before),
                    target=len(after),
                    matched=matched,
                    changed=len(shared) - matched,
                    missing=len(before.keys() - after.keys()),
                    extra=len(after.keys() - before.keys()),
                ))
    finally:
        source.dispose()
        target.dispose()
    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_url")
    parser.add_argument("target_url")
    args = parser.parse_args(argv)
    try:
        results = compare_databases(args.source_url, args.target_url)
    except SQLAlchemyError as error:
        print(f"Comparison failed: {type(error).__name__}", file=sys.stderr)
        return 1
    print("table | source | target | matched | changed | missing | extra")
    for r in results:
        print(f"{r.table} | {r.source} | {r.target} | {r.matched} | {r.changed} | {r.missing} | {r.extra}")
    return 0 if all(r.changed == 0 and r.missing == 0 for r in results) else 2


if __name__ == "__main__":
    raise SystemExit(main())
