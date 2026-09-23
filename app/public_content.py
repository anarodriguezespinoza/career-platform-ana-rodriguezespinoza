"""Public content access with snapshot fallback."""

from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.domain.content import PublicContent, PublicProject
from app.domain.snapshot import ContentSource, get_runtime_snapshot_store, read_public_content
from app.repositories import ContentRepository

_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def get_public_content(session: Session) -> tuple[PublicContent, ContentSource]:
    return read_public_content(
        load_live=lambda: ContentRepository(session).list_published(),
        snapshot_store=get_runtime_snapshot_store,
    )


def find_public_project(slug: str, content: PublicContent) -> PublicProject | None:
    if not _SLUG.match(slug):
        return None
    return next((project for project in content.projects if project.slug == slug), None)
