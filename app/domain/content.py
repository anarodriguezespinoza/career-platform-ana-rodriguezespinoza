"""Content types and publication rules.

Editable records carry their publication state; public records are the
projection that visitors (and the S3 snapshot) may see.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime
from typing import Any, Literal

from app.models import PublicationState

ContentType = Literal["profile", "experience", "project", "skill", "resumeSettings"]
CONTENT_TYPES: tuple[ContentType, ...] = ("profile", "experience", "project", "skill", "resumeSettings")


@dataclass(frozen=True)
class ProjectTechnology:
    project_id: str
    technology: str
    display_order: int


@dataclass(frozen=True)
class EditableProfile:
    id: str
    name: str
    headline: str
    summary: str
    email: str
    location: str
    avatar_url: str | None
    publication_state: str


@dataclass(frozen=True)
class EditableExperience:
    id: str
    company: str
    role: str
    description: str
    start_date: datetime
    end_date: datetime | None
    display_order: int
    publication_state: str


@dataclass(frozen=True)
class EditableProject:
    id: str
    slug: str
    name: str
    description: str
    url: str | None
    repository_url: str | None
    is_featured: bool
    display_order: int
    publication_state: str
    technologies: list[ProjectTechnology] = field(default_factory=list)


@dataclass(frozen=True)
class EditableSkill:
    id: str
    name: str
    category: str
    display_order: int
    publication_state: str


@dataclass(frozen=True)
class EditableResumeSettings:
    id: str
    title: str
    intro: str
    resume_url: str | None
    publication_state: str


@dataclass(frozen=True)
class EditableContent:
    profile: EditableProfile | None
    experience: list[EditableExperience]
    projects: list[EditableProject]
    skills: list[EditableSkill]
    resume_settings: EditableResumeSettings | None


@dataclass(frozen=True)
class PublicProfile:
    id: str
    name: str
    headline: str
    summary: str
    email: str
    location: str
    avatar_url: str | None


@dataclass(frozen=True)
class PublicExperience:
    id: str
    company: str
    role: str
    description: str
    start_date: datetime
    end_date: datetime | None
    display_order: int


@dataclass(frozen=True)
class PublicProject:
    id: str
    slug: str
    name: str
    description: str
    url: str | None
    repository_url: str | None
    is_featured: bool
    display_order: int
    technologies: list[ProjectTechnology]


@dataclass(frozen=True)
class PublicSkill:
    id: str
    name: str
    category: str
    display_order: int


@dataclass(frozen=True)
class PublicResumeSettings:
    id: str
    title: str
    intro: str
    resume_url: str | None


@dataclass(frozen=True)
class PublicContent:
    profile: PublicProfile | None
    experience: list[PublicExperience]
    projects: list[PublicProject]
    skills: list[PublicSkill]
    resume_settings: PublicResumeSettings | None


def _is_published(record: Any) -> bool:
    return record.publication_state == PublicationState.PUBLISHED


def _order_key(record: EditableExperience | EditableProject | EditableSkill) -> tuple[int, str]:
    return (record.display_order, record.id)


def _technology_order_key(technology: ProjectTechnology) -> tuple[int, str]:
    return (technology.display_order, technology.technology)


def validate_publishable_content(records: EditableContent) -> list[str]:
    """Return validation errors for the records that are marked as published."""
    errors: list[str] = []
    profile = records.profile if records.profile and _is_published(records.profile) else None
    resume = records.resume_settings if records.resume_settings and _is_published(records.resume_settings) else None

    if profile:
        for name in ("name", "headline", "summary", "email", "location"):
            if not getattr(profile, name).strip():
                errors.append(f"profile.{name} is required")

    for index, item in enumerate(r for r in records.experience if _is_published(r)):
        for name in ("company", "role", "description"):
            if not getattr(item, name).strip():
                errors.append(f"experience[{index}].{name} is required")
        if not isinstance(item.start_date, datetime):
            errors.append(f"experience[{index}].startDate must be a valid date")

    for index, project in enumerate(r for r in records.projects if _is_published(r)):
        for name in ("slug", "name", "description"):
            if not getattr(project, name).strip():
                errors.append(f"projects[{index}].{name} is required")

    for index, skill in enumerate(r for r in records.skills if _is_published(r)):
        for name in ("name", "category"):
            if not getattr(skill, name).strip():
                errors.append(f"skills[{index}].{name} is required")

    if resume:
        for name in ("title", "intro"):
            if not getattr(resume, name).strip():
                errors.append(f"resumeSettings.{name} is required")

    return errors


class ContentNotPublishableError(ValueError):
    pass


def build_public_content(records: EditableContent) -> PublicContent:
    errors = validate_publishable_content(records)
    if errors:
        raise ContentNotPublishableError(f"Content is not publishable: {', '.join(errors)}")

    profile = records.profile if records.profile and _is_published(records.profile) else None
    resume = records.resume_settings if records.resume_settings and _is_published(records.resume_settings) else None
    return PublicContent(
        profile=profile and PublicProfile(
            id=profile.id,
            name=profile.name,
            headline=profile.headline,
            summary=profile.summary,
            email=profile.email,
            location=profile.location,
            avatar_url=profile.avatar_url,
        ),
        experience=[
            PublicExperience(
                id=item.id,
                company=item.company,
                role=item.role,
                description=item.description,
                start_date=item.start_date,
                end_date=item.end_date,
                display_order=item.display_order,
            )
            for item in sorted(filter(_is_published, records.experience), key=_order_key)
        ],
        projects=[
            PublicProject(
                id=project.id,
                slug=project.slug,
                name=project.name,
                description=project.description,
                url=project.url,
                repository_url=project.repository_url,
                is_featured=project.is_featured,
                display_order=project.display_order,
                technologies=sorted(project.technologies, key=_technology_order_key),
            )
            for project in sorted(filter(_is_published, records.projects), key=_order_key)
        ],
        skills=[
            PublicSkill(id=skill.id, name=skill.name, category=skill.category, display_order=skill.display_order)
            for skill in sorted(filter(_is_published, records.skills), key=_order_key)
        ],
        resume_settings=resume and PublicResumeSettings(
            id=resume.id, title=resume.title, intro=resume.intro, resume_url=resume.resume_url
        ),
    )


def mark_publishable_records(content: EditableContent) -> EditableContent:
    """Treat every non-archived record as published, for pre-publish validation."""

    def publish(record):  # type: ignore[no-untyped-def]
        if record is None or record.publication_state == PublicationState.ARCHIVED:
            return record
        return replace(record, publication_state=PublicationState.PUBLISHED.value)

    return EditableContent(
        profile=publish(content.profile),
        experience=[publish(record) for record in content.experience],
        projects=[publish(record) for record in content.projects],
        skills=[publish(record) for record in content.skills],
        resume_settings=publish(content.resume_settings),
    )
