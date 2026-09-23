"""Owner-only content management: drafts, preview, publishing, and snapshot refresh."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager
from datetime import datetime
from typing import Any, Literal, Protocol, TypeVar

from app.auth import AdminIdentity, AuthenticationError
from app.domain.content import (
    ContentType,
    EditableContent,
    PublicContent,
    build_public_content,
    mark_publishable_records,
    validate_publishable_content,
)
from app.domain.snapshot import SnapshotStore, create_snapshot
from app.models import PublicationState
from app.observability import error_type, logger

T = TypeVar("T")


class ContentRepositoryPort(Protocol):
    def get_draft_content(self) -> EditableContent: ...

    def save_draft(self, content_type: ContentType, record_id: str, values: dict[str, Any]) -> None: ...

    def set_publication_state(self, content_type: ContentType, record_id: str, state: str) -> None: ...

    def transaction(self) -> AbstractContextManager[Any]: ...


class AdminOperationError(Exception):
    def __init__(self, code: Literal["TEMPORARY_DATABASE_ERROR", "INVALID_CONTENT"], message: str) -> None:
        super().__init__(message)
        self.code = code


# Form fields per content type: (form name, model attribute, kind, required)
FieldKind = Literal["text", "textarea", "date", "int", "bool", "list"]
DRAFT_FIELDS: dict[ContentType, list[tuple[str, str, FieldKind, bool]]] = {
    "profile": [
        ("name", "name", "text", True),
        ("headline", "headline", "text", True),
        ("summary", "summary", "textarea", True),
        ("email", "email", "text", True),
        ("location", "location", "text", True),
        ("avatarUrl", "avatar_url", "text", False),
    ],
    "experience": [
        ("company", "company", "text", True),
        ("role", "role", "text", True),
        ("description", "description", "textarea", True),
        ("startDate", "start_date", "date", True),
        ("endDate", "end_date", "date", False),
        ("displayOrder", "display_order", "int", False),
    ],
    "project": [
        ("slug", "slug", "text", True),
        ("name", "name", "text", True),
        ("description", "description", "textarea", True),
        ("url", "url", "text", False),
        ("repositoryUrl", "repository_url", "text", False),
        ("technologies", "technologies", "list", False),
        ("isFeatured", "is_featured", "bool", False),
        ("displayOrder", "display_order", "int", False),
    ],
    "skill": [
        ("name", "name", "text", True),
        ("category", "category", "text", True),
        ("displayOrder", "display_order", "int", False),
    ],
    "resumeSettings": [
        ("title", "title", "text", True),
        ("intro", "intro", "textarea", True),
        ("resumeUrl", "resume_url", "text", False),
    ],
}


def normalize_draft_input(content_type: ContentType, record_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Validate raw form values and convert them to model attribute values."""
    if not record_id.strip() or content_type not in DRAFT_FIELDS:
        raise AdminOperationError("INVALID_CONTENT", "A record type, id, and data are required")

    values: dict[str, Any] = {}
    for form_name, attribute, kind, required in DRAFT_FIELDS[content_type]:
        raw = data.get(form_name)
        if kind == "bool":
            values[attribute] = raw is True or raw in ("on", "true", "1")
            continue
        if kind == "list":
            items = raw if isinstance(raw, list) else str(raw or "").split(",")
            values[attribute] = list(dict.fromkeys(str(item).strip() for item in items if str(item).strip()))
            continue
        text = "" if raw is None else str(raw).strip()
        if required and not text:
            raise AdminOperationError("INVALID_CONTENT", f"{content_type}.{form_name} is required")
        if kind == "int":
            try:
                values[attribute] = int(text or 0)
            except ValueError as error:
                raise AdminOperationError("INVALID_CONTENT", f"{content_type}.{form_name} must be a whole number") from error
            if values[attribute] < 0:
                raise AdminOperationError("INVALID_CONTENT", f"{content_type}.{form_name} must not be negative")
        elif kind == "date":
            try:
                values[attribute] = _parse_date(text) if text else None
            except ValueError as error:
                raise AdminOperationError("INVALID_CONTENT", f"{content_type}.{form_name} must be a valid date") from error
        else:
            values[attribute] = text if text or required else None
    return values


def _parse_date(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed


def _require_actor(actor: AdminIdentity | None) -> AdminIdentity:
    if actor is None:
        raise AuthenticationError()
    return actor


class AdminContentService:
    def __init__(self, repository: ContentRepositoryPort, snapshot_store: SnapshotStore | None = None) -> None:
        self.repository = repository
        self.snapshot_store = snapshot_store

    def _run(self, operation_name: str, request_id: str | None, operation: Callable[[], T]) -> T:
        try:
            return operation()
        except (AdminOperationError, AuthenticationError):
            raise
        except Exception as error:
            logger.error("admin_content_operation_failed", {"operation": operation_name, "requestId": request_id, "errorType": error_type(error)})
            raise AdminOperationError("TEMPORARY_DATABASE_ERROR", "The database is temporarily unavailable") from error

    def _log(self, actor: AdminIdentity, operation: str, content_type: str | None = None, record_id: str | None = None, request_id: str | None = None) -> None:
        logger.info("admin_content_operation", {"actorSubject": actor.subject, "operation": operation, "type": content_type, "id": record_id, "requestId": request_id})

    def save_draft(self, content_type: ContentType, record_id: str, data: dict[str, Any], actor: AdminIdentity | None, request_id: str | None = None) -> EditableContent:
        identity = _require_actor(actor)

        def operation() -> EditableContent:
            values = normalize_draft_input(content_type, record_id, data)
            with self.repository.transaction():
                self.repository.save_draft(content_type, record_id, values)
            self._log(identity, "save_draft", content_type, record_id, request_id)
            return self.repository.get_draft_content()

        return self._run("save_draft", request_id, operation)

    def preview_draft(self, actor: AdminIdentity | None, request_id: str | None = None) -> EditableContent:
        identity = _require_actor(actor)

        def operation() -> EditableContent:
            content = self.repository.get_draft_content()
            self._log(identity, "preview_draft", request_id=request_id)
            return content

        return self._run("preview_draft", request_id, operation)

    def publish_content(self, actor: AdminIdentity | None, request_id: str | None = None) -> bool:
        """Publish every non-archived record. Returns whether the snapshot was refreshed."""
        identity = _require_actor(actor)

        def operation() -> bool:
            with self.repository.transaction():
                content = self.repository.get_draft_content()
                publishable = mark_publishable_records(content)
                errors = validate_publishable_content(publishable)
                if errors:
                    raise AdminOperationError("INVALID_CONTENT", ", ".join(errors))
                for content_type, record_id in _non_archived_records(content):
                    self.repository.set_publication_state(content_type, record_id, PublicationState.PUBLISHED.value)
                published = build_public_content(publishable)
            refreshed = self._refresh_snapshot(published)
            self._log(identity, "publish", request_id=request_id)
            return refreshed

        return self._run("publish", request_id, operation)

    def unpublish_record(self, content_type: ContentType, record_id: str, actor: AdminIdentity | None, request_id: str | None = None) -> None:
        self._change_state(content_type, record_id, PublicationState.DRAFT.value, actor, "unpublish", request_id)

    def archive_record(self, content_type: ContentType, record_id: str, actor: AdminIdentity | None, request_id: str | None = None) -> None:
        self._change_state(content_type, record_id, PublicationState.ARCHIVED.value, actor, "archive", request_id)

    def _change_state(self, content_type: ContentType, record_id: str, state: str, actor: AdminIdentity | None, operation_name: str, request_id: str | None) -> None:
        identity = _require_actor(actor)

        def operation() -> None:
            with self.repository.transaction():
                self.repository.set_publication_state(content_type, record_id, state)
                content = self.repository.get_draft_content()
            self._refresh_snapshot(build_public_content(content))
            self._log(identity, operation_name, content_type, record_id, request_id)

        self._run(operation_name, request_id, operation)

    def _refresh_snapshot(self, content: PublicContent) -> bool:
        if self.snapshot_store is None:
            return False
        self.snapshot_store.write(create_snapshot(content))
        return True


def _non_archived_records(content: EditableContent) -> Iterator[tuple[ContentType, str]]:
    archived = PublicationState.ARCHIVED.value
    if content.profile and content.profile.publication_state != archived:
        yield "profile", content.profile.id
    for record in content.experience:
        if record.publication_state != archived:
            yield "experience", record.id
    for project in content.projects:
        if project.publication_state != archived:
            yield "project", project.id
    for skill in content.skills:
        if skill.publication_state != archived:
            yield "skill", skill.id
    if content.resume_settings and content.resume_settings.publication_state != archived:
        yield "resumeSettings", content.resume_settings.id
