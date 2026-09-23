"""Published-content snapshot: strict JSON schema, S3 store, and fallback reader.

The JSON format (camelCase keys, ISO dates, schema version 2) is shared with
snapshots written by earlier releases, and version 1 snapshots are still read.
"""

from __future__ import annotations

import json
import os
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal, Protocol

from app.domain.content import (
    EditableContent,
    ProjectTechnology,
    PublicContent,
    PublicExperience,
    PublicProfile,
    PublicProject,
    PublicResumeSettings,
    PublicSkill,
    build_public_content,
)
from app.observability import error_type, logger

SNAPSHOT_SCHEMA_VERSION = 2
DEFAULT_SNAPSHOT_KEY = "public/content.json"
ContentSource = Literal["database", "snapshot"]


class SnapshotValidationError(ValueError):
    pass


class PublicContentUnavailableError(Exception):
    def __init__(self) -> None:
        super().__init__("Public content is unavailable: database and published snapshot could not be read")


class PublicSnapshotConfigurationError(Exception):
    def __init__(self) -> None:
        super().__init__("published snapshot store is not configured")


@dataclass(frozen=True)
class PublishedSnapshot:
    generated_at: str
    content: PublicContent
    schema_version: int = SNAPSHOT_SCHEMA_VERSION


# --- JSON serialization -------------------------------------------------------


def iso_timestamp(value: datetime) -> str:
    """Format like JavaScript's Date.toISOString()."""
    if value.tzinfo is not None:
        value = value.astimezone(UTC).replace(tzinfo=None)
    return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


def parse_iso_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.astimezone(UTC).replace(tzinfo=None) if parsed.tzinfo else parsed


def content_to_json(content: PublicContent) -> dict[str, Any]:
    profile = content.profile
    resume = content.resume_settings
    return {
        "profile": profile and {
            "id": profile.id,
            "name": profile.name,
            "headline": profile.headline,
            "summary": profile.summary,
            "email": profile.email,
            "location": profile.location,
            "avatarUrl": profile.avatar_url,
        },
        "experience": [
            {
                "id": item.id,
                "company": item.company,
                "role": item.role,
                "description": item.description,
                "startDate": iso_timestamp(item.start_date),
                "endDate": item.end_date and iso_timestamp(item.end_date),
                "displayOrder": item.display_order,
            }
            for item in content.experience
        ],
        "projects": [
            {
                "id": project.id,
                "slug": project.slug,
                "name": project.name,
                "description": project.description,
                "url": project.url,
                "repositoryUrl": project.repository_url,
                "isFeatured": project.is_featured,
                "displayOrder": project.display_order,
                "technologies": [
                    {"projectId": t.project_id, "technology": t.technology, "displayOrder": t.display_order}
                    for t in project.technologies
                ],
            }
            for project in content.projects
        ],
        "skills": [
            {"id": skill.id, "name": skill.name, "category": skill.category, "displayOrder": skill.display_order}
            for skill in content.skills
        ],
        "resumeSettings": resume and {
            "id": resume.id, "title": resume.title, "intro": resume.intro, "resumeUrl": resume.resume_url
        },
    }


def snapshot_to_json(snapshot: PublishedSnapshot) -> dict[str, Any]:
    return {
        "schemaVersion": SNAPSHOT_SCHEMA_VERSION,
        "generatedAt": snapshot.generated_at,
        "content": content_to_json(snapshot.content),
    }


def create_snapshot(content: PublicContent) -> PublishedSnapshot:
    snapshot = PublishedSnapshot(generated_at=iso_timestamp(datetime.now(UTC)), content=content)
    # Round-trip through the strict parser so an invalid projection is never written.
    return parse_snapshot(snapshot_to_json(snapshot))


# --- Strict parsing -------------------------------------------------------------


def _exact_keys(value: Mapping[str, Any], keys: list[str], path: str) -> None:
    if sorted(value.keys()) != sorted(keys):
        raise SnapshotValidationError(f"{path} contains unsupported or missing fields")


def _record(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise SnapshotValidationError(f"{path} must be an object")
    return value


def _string(value: Any, path: str) -> str:
    if not isinstance(value, str):
        raise SnapshotValidationError(f"{path} must be a string")
    return value


def _nullable_string(value: Any, path: str) -> str | None:
    if value is not None and not isinstance(value, str):
        raise SnapshotValidationError(f"{path} must be a string or null")
    return value


def _date(value: Any, path: str) -> datetime:
    if not isinstance(value, str):
        raise SnapshotValidationError(f"{path} must be a valid date")
    try:
        return parse_iso_timestamp(value)
    except ValueError as error:
        raise SnapshotValidationError(f"{path} must be a valid date") from error


def _order(value: Any, path: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise SnapshotValidationError(f"{path} must be a non-negative integer")
    return value


def _parse_profile(value: Any) -> PublicProfile | None:
    if value is None:
        return None
    path = "content.profile"
    profile = _record(value, path)
    _exact_keys(profile, ["id", "name", "headline", "summary", "email", "location", "avatarUrl"], path)
    return PublicProfile(
        **{name: _string(profile[name], f"{path}.{name}") for name in ("id", "name", "headline", "summary", "email", "location")},
        avatar_url=_nullable_string(profile["avatarUrl"], f"{path}.avatarUrl"),
    )


def _list(value: Any, path: str) -> list[Any]:
    if not isinstance(value, list):
        raise SnapshotValidationError(f"{path} must be an array")
    return value


def _parse_experience(value: Any) -> list[PublicExperience]:
    items = []
    for index, raw in enumerate(_list(value, "content.experience")):
        path = f"content.experience[{index}]"
        item = _record(raw, path)
        _exact_keys(item, ["id", "company", "role", "description", "startDate", "endDate", "displayOrder"], path)
        items.append(PublicExperience(
            **{name: _string(item[name], f"{path}.{name}") for name in ("id", "company", "role", "description")},
            start_date=_date(item["startDate"], f"{path}.startDate"),
            end_date=None if item["endDate"] is None else _date(item["endDate"], f"{path}.endDate"),
            display_order=_order(item["displayOrder"], f"{path}.displayOrder"),
        ))
    return items


def _parse_projects(value: Any, schema_version: int) -> list[PublicProject]:
    projects = []
    for index, raw in enumerate(_list(value, "content.projects")):
        path = f"content.projects[{index}]"
        project = dict(_record(raw, path))
        if schema_version == 1:
            project.setdefault("isFeatured", False)
        _exact_keys(project, ["id", "slug", "name", "description", "url", "repositoryUrl", "isFeatured", "displayOrder", "technologies"], path)
        if not isinstance(project["isFeatured"], bool):
            raise SnapshotValidationError(f"{path}.isFeatured must be a boolean")
        technologies = []
        for technology_index, raw_technology in enumerate(_list(project["technologies"], f"{path}.technologies")):
            technology_path = f"{path}.technologies[{technology_index}]"
            technology = _record(raw_technology, technology_path)
            _exact_keys(technology, ["projectId", "technology", "displayOrder"], technology_path)
            technologies.append(ProjectTechnology(
                project_id=_string(technology["projectId"], f"{technology_path}.projectId"),
                technology=_string(technology["technology"], f"{technology_path}.technology"),
                display_order=_order(technology["displayOrder"], f"{technology_path}.displayOrder"),
            ))
        projects.append(PublicProject(
            **{name: _string(project[name], f"{path}.{name}") for name in ("id", "slug", "name", "description")},
            url=_nullable_string(project["url"], f"{path}.url"),
            repository_url=_nullable_string(project["repositoryUrl"], f"{path}.repositoryUrl"),
            is_featured=project["isFeatured"],
            display_order=_order(project["displayOrder"], f"{path}.displayOrder"),
            technologies=technologies,
        ))
    return projects


def _parse_skills(value: Any) -> list[PublicSkill]:
    skills = []
    for index, raw in enumerate(_list(value, "content.skills")):
        path = f"content.skills[{index}]"
        skill = _record(raw, path)
        _exact_keys(skill, ["id", "name", "category", "displayOrder"], path)
        skills.append(PublicSkill(
            **{name: _string(skill[name], f"{path}.{name}") for name in ("id", "name", "category")},
            display_order=_order(skill["displayOrder"], f"{path}.displayOrder"),
        ))
    return skills


def _parse_resume_settings(value: Any) -> PublicResumeSettings | None:
    if value is None:
        return None
    path = "content.resumeSettings"
    resume = _record(value, path)
    _exact_keys(resume, ["id", "title", "intro", "resumeUrl"], path)
    return PublicResumeSettings(
        **{name: _string(resume[name], f"{path}.{name}") for name in ("id", "title", "intro")},
        resume_url=_nullable_string(resume["resumeUrl"], f"{path}.resumeUrl"),
    )


def parse_snapshot(value: Any) -> PublishedSnapshot:
    snapshot = _record(value, "snapshot")
    _exact_keys(snapshot, ["schemaVersion", "generatedAt", "content"], "snapshot")
    schema_version = snapshot["schemaVersion"]
    if schema_version not in (1, SNAPSHOT_SCHEMA_VERSION) or isinstance(schema_version, bool):
        raise SnapshotValidationError("unsupported snapshot schema version")
    generated_at = snapshot["generatedAt"]
    try:
        if not isinstance(generated_at, str):
            raise ValueError
        parse_iso_timestamp(generated_at)
    except ValueError as error:
        raise SnapshotValidationError("generatedAt must be an ISO date") from error

    content = _record(snapshot["content"], "content")
    _exact_keys(content, ["profile", "experience", "projects", "skills", "resumeSettings"], "content")
    return PublishedSnapshot(
        generated_at=generated_at,
        content=PublicContent(
            profile=_parse_profile(content["profile"]),
            experience=_parse_experience(content["experience"]),
            projects=_parse_projects(content["projects"], schema_version),
            skills=_parse_skills(content["skills"]),
            resume_settings=_parse_resume_settings(content["resumeSettings"]),
        ),
    )


# --- Stores ----------------------------------------------------------------------


class SnapshotStore(Protocol):
    def read(self) -> PublishedSnapshot | None: ...

    def write(self, snapshot: PublishedSnapshot) -> None: ...


class S3SnapshotStore:
    def __init__(self, client: Any, bucket: str, key: str = DEFAULT_SNAPSHOT_KEY) -> None:
        self._client = client
        self._bucket = bucket
        self._key = key

    def read(self) -> PublishedSnapshot | None:
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=self._key)
        except Exception as error:
            if _is_missing_object(error):
                return None
            raise
        body = response.get("Body")
        if body is None:
            raise SnapshotValidationError("Snapshot object has no body")
        return parse_snapshot(json.loads(body.read()))

    def write(self, snapshot: PublishedSnapshot) -> None:
        validated = parse_snapshot(snapshot_to_json(snapshot))
        self._client.put_object(
            Bucket=self._bucket,
            Key=self._key,
            Body=json.dumps(snapshot_to_json(validated)).encode(),
            ContentType="application/json",
        )


def _is_missing_object(error: Exception) -> bool:
    response = getattr(error, "response", None)
    code = response.get("Error", {}).get("Code") if isinstance(response, dict) else None
    return code in ("NoSuchKey", "404") or type(error).__name__ == "NoSuchKey"


def get_runtime_snapshot_store(env: Mapping[str, str] | None = None, client: Any = None) -> SnapshotStore:
    env = os.environ if env is None else env
    bucket = env.get("S3_SNAPSHOT_BUCKET")
    if not bucket:
        raise PublicSnapshotConfigurationError()
    if client is None:
        import boto3

        client = boto3.client("s3")
    return S3SnapshotStore(client, bucket, env.get("S3_SNAPSHOT_KEY") or DEFAULT_SNAPSHOT_KEY)


# --- Fallback reader -----------------------------------------------------------------


def read_public_content(
    load_live: Callable[[], EditableContent],
    snapshot_store: Callable[[], SnapshotStore],
) -> tuple[PublicContent, ContentSource]:
    """Serve live published content, falling back to the last validated snapshot.

    The snapshot store is created lazily so a healthy read never touches S3.
    """
    try:
        content = build_public_content(load_live())
        logger.info("public_content_source", {"source": "database"})
        return content, "database"
    except Exception as database_error:
        logger.warn("public_content_database_unavailable", {"errorType": error_type(database_error)})
        try:
            snapshot = snapshot_store().read()
        except Exception as snapshot_error:
            logger.warn("public_content_snapshot_unavailable", {"errorType": error_type(snapshot_error)})
            raise PublicContentUnavailableError() from snapshot_error
        if snapshot is None:
            raise PublicContentUnavailableError() from database_error
        logger.info("public_content_fallback", {"source": "snapshot"})
        return snapshot.content, "snapshot"
