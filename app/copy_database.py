"""Copy every model table from one database into an empty, already-migrated target.

Usage: python -m app.copy_database SOURCE_URL TARGET_URL
"""

from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Boolean, Column, DateTime, func, select, text
from sqlalchemy.exc import SQLAlchemyError

from app.db import build_engine
from app.models import Base


class TargetNotEmptyError(Exception):
    def __init__(self, tables: list[str]) -> None:
        super().__init__(f"Target database already has rows in: {', '.join(tables)}")


def coerce_timestamp(value: object) -> datetime | None:
    """Read both SQLAlchemy text timestamps and Prisma's integer milliseconds since the epoch."""
    if value is None or isinstance(value, datetime):
        return value
    if isinstance(value, int | float):
        return datetime.fromtimestamp(value / 1000, UTC).replace(tzinfo=None)
    if isinstance(value, str):
        return datetime.fromisoformat(value)
    raise TypeError(f"Unsupported timestamp value of type {type(value).__name__}")


def _convert(column: Column, value: Any) -> Any:
    if isinstance(column.type, DateTime):
        return coerce_timestamp(value)
    if isinstance(column.type, Boolean) and value is not None:
        return bool(value)
    return value


def copy_database(source_url: str, target_url: str) -> dict[str, int]:
    # hide_parameters keeps inquiry contents out of error messages and tracebacks.
    source = build_engine(source_url, hide_parameters=True)
    target = build_engine(target_url, hide_parameters=True)
    counts: dict[str, int] = {}
    try:
        with source.connect() as reader, target.begin() as writer:
            non_empty = [t.name for t in Base.metadata.sorted_tables if writer.scalar(select(func.count()).select_from(t))]
            if non_empty:
                raise TargetNotEmptyError(non_empty)
            for table in Base.metadata.sorted_tables:
                # Raw SQL so SQLAlchemy's DateTime processor never sees Prisma's integer timestamps.
                rows = [
                    {c.name: _convert(c, row[c.name]) for c in table.columns}
                    for row in reader.execute(text(f'SELECT * FROM "{table.name}"')).mappings()
                ]
                if rows:
                    writer.execute(table.insert(), rows)
                counts[table.name] = len(rows)
    finally:
        source.dispose()
        target.dispose()
    return counts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_url")
    parser.add_argument("target_url")
    args = parser.parse_args(argv)
    try:
        counts = copy_database(args.source_url, args.target_url)
    except (SQLAlchemyError, TargetNotEmptyError) as error:
        detail = error if isinstance(error, TargetNotEmptyError) else type(error).__name__
        print(f"Copy failed, no rows were written: {detail}", file=sys.stderr)
        return 1
    for table, count in counts.items():
        print(f"{table}: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
