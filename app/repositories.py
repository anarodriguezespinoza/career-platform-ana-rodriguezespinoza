"""Database access for content and inquiries."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app import models
from app.domain.content import (
    ContentType,
    EditableContent,
    EditableExperience,
    EditableProfile,
    EditableProject,
    EditableResumeSettings,
    EditableSkill,
    ProjectTechnology,
)
from app.models import ContactInquiry, InquiryStatus, NotificationStatus, PublicationState

_MODEL_BY_TYPE: dict[str, type[models.Base]] = {
    "profile": models.Profile,
    "experience": models.Experience,
    "project": models.Project,
    "skill": models.Skill,
    "resumeSettings": models.ResumeSettings,
}


class RecordNotFoundError(LookupError):
    pass


def _profile(row: models.Profile) -> EditableProfile:
    return EditableProfile(
        id=row.id, name=row.name, headline=row.headline, summary=row.summary, email=row.email,
        location=row.location, avatar_url=row.avatar_url, publication_state=row.publication_state,
    )


def _experience(row: models.Experience) -> EditableExperience:
    return EditableExperience(
        id=row.id, company=row.company, role=row.role, description=row.description, start_date=row.start_date,
        end_date=row.end_date, display_order=row.display_order, publication_state=row.publication_state,
    )


def _project(row: models.Project) -> EditableProject:
    return EditableProject(
        id=row.id, slug=row.slug, name=row.name, description=row.description, url=row.url,
        repository_url=row.repository_url, is_featured=row.is_featured, display_order=row.display_order,
        publication_state=row.publication_state,
        technologies=[
            ProjectTechnology(project_id=t.project_id, technology=t.technology, display_order=t.display_order)
            for t in row.technologies
        ],
    )


def _skill(row: models.Skill) -> EditableSkill:
    return EditableSkill(
        id=row.id, name=row.name, category=row.category, display_order=row.display_order,
        publication_state=row.publication_state,
    )


def _resume_settings(row: models.ResumeSettings) -> EditableResumeSettings:
    return EditableResumeSettings(
        id=row.id, title=row.title, intro=row.intro, resume_url=row.resume_url, publication_state=row.publication_state,
    )


class ContentRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_published(self) -> EditableContent:
        return self._load(published_only=True)

    def get_draft_content(self) -> EditableContent:
        return self._load(published_only=False)

    def _load(self, published_only: bool) -> EditableContent:
        def query(model: Any):  # type: ignore[no-untyped-def]
            statement = select(model)
            if published_only:
                statement = statement.where(model.publication_state == PublicationState.PUBLISHED.value)
            return statement

        ordered = lambda model: query(model).order_by(model.display_order, model.id)  # noqa: E731
        profile = self.session.scalars(query(models.Profile).order_by(models.Profile.id).limit(1)).first()
        resume = self.session.scalars(query(models.ResumeSettings).order_by(models.ResumeSettings.id).limit(1)).first()
        return EditableContent(
            profile=profile and _profile(profile),
            experience=[_experience(row) for row in self.session.scalars(ordered(models.Experience))],
            projects=[
                _project(row)
                for row in self.session.scalars(ordered(models.Project).options(selectinload(models.Project.technologies)))
            ],
            skills=[_skill(row) for row in self.session.scalars(ordered(models.Skill))],
            resume_settings=resume and _resume_settings(resume),
        )

    def save_draft(self, content_type: ContentType, record_id: str, values: dict[str, Any]) -> None:
        """Upsert a record as a draft. `values` uses model attribute names."""
        values = dict(values)
        technologies = values.pop("technologies", None)
        model = _MODEL_BY_TYPE[content_type]
        row = self.session.get(model, record_id)
        if row is None:
            row = model(id=record_id)
            self.session.add(row)
        for name, value in values.items():
            setattr(row, name, value)
        row.publication_state = PublicationState.DRAFT.value  # type: ignore[attr-defined]
        if content_type == "project" and technologies is not None:
            self.session.flush()
            self.session.execute(delete(models.ProjectTechnology).where(models.ProjectTechnology.project_id == record_id))
            self.session.add_all(
                models.ProjectTechnology(project_id=record_id, technology=technology, display_order=index)
                for index, technology in enumerate(technologies)
            )
            self.session.flush()
            self.session.expire(row, ["technologies"])
        self.session.flush()

    def set_publication_state(self, content_type: ContentType, record_id: str, state: str) -> None:
        row = self.session.get(_MODEL_BY_TYPE[content_type], record_id)
        if row is None:
            raise RecordNotFoundError(f"{content_type} {record_id} not found")
        row.publication_state = state  # type: ignore[attr-defined]
        self.session.flush()

    @contextmanager
    def transaction(self) -> Iterator[ContentRepository]:
        try:
            yield self
            self.session.commit()
        except BaseException:
            self.session.rollback()
            raise


@dataclass(frozen=True)
class CreateInquiryInput:
    name: str
    email: str
    message: str
    opportunity_type: str
    source: str


class InquiryRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, data: CreateInquiryInput) -> ContactInquiry:
        inquiry = ContactInquiry(
            id=str(uuid.uuid4()),
            name=data.name,
            email=data.email,
            message=data.message,
            opportunity_type=data.opportunity_type,
            source=data.source,
            private_notes="",
            status=InquiryStatus.NEW.value,
            notification_status=NotificationStatus.PENDING.value,
        )
        self.session.add(inquiry)
        self.session.commit()
        return inquiry

    def find_by_id(self, inquiry_id: str) -> ContactInquiry | None:
        return self.session.get(ContactInquiry, inquiry_id)

    def list(self, status: str | None = None, notification_status: str | None = None) -> list[ContactInquiry]:
        statement = select(ContactInquiry).order_by(ContactInquiry.created_at.desc(), ContactInquiry.id)
        if status:
            statement = statement.where(ContactInquiry.status == status)
        if notification_status:
            statement = statement.where(ContactInquiry.notification_status == notification_status)
        return list(self.session.scalars(statement))

    def _update(self, inquiry_id: str, **values: Any) -> ContactInquiry:
        inquiry = self.find_by_id(inquiry_id)
        if inquiry is None:
            raise RecordNotFoundError(f"inquiry {inquiry_id} not found")
        for name, value in values.items():
            setattr(inquiry, name, value)
        self.session.commit()
        return inquiry

    def update_status(self, inquiry_id: str, status: InquiryStatus) -> ContactInquiry:
        return self._update(inquiry_id, status=status.value)

    def update_notes(self, inquiry_id: str, notes: str) -> ContactInquiry:
        return self._update(inquiry_id, private_notes=notes)

    def update_notification_status(self, inquiry_id: str, status: NotificationStatus, error: str | None = None) -> ContactInquiry:
        return self._update(inquiry_id, notification_status=status.value, notification_error=error)

    def delete(self, inquiry_id: str) -> None:
        inquiry = self.find_by_id(inquiry_id)
        if inquiry is None:
            raise RecordNotFoundError(f"inquiry {inquiry_id} not found")
        self.session.delete(inquiry)
        self.session.commit()
