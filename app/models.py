"""Database models.

Table and column names match the original Prisma schema so existing databases
remain compatible.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class PublicationState(StrEnum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


class InquiryStatus(StrEnum):
    NEW = "NEW"
    READ = "READ"
    REPLIED = "REPLIED"
    ARCHIVED = "ARCHIVED"


class NotificationStatus(StrEnum):
    PENDING = "PENDING"
    SENT = "SENT"
    FAILED = "FAILED"


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class Base(DeclarativeBase):
    type_annotation_map = {str: Text, int: Integer, bool: Boolean, datetime: DateTime}


def _publication_state() -> Mapped[str]:
    return mapped_column("publicationState", default=PublicationState.DRAFT.value, server_default=PublicationState.DRAFT.value)


def _created_at() -> Mapped[datetime]:
    return mapped_column("createdAt", default=utcnow, server_default=func.current_timestamp())


def _updated_at() -> Mapped[datetime]:
    return mapped_column("updatedAt", default=utcnow, onupdate=utcnow)


class Profile(Base):
    __tablename__ = "Profile"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
    headline: Mapped[str]
    summary: Mapped[str]
    email: Mapped[str]
    location: Mapped[str]
    avatar_url: Mapped[str | None] = mapped_column("avatarUrl")
    publication_state: Mapped[str] = _publication_state()
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()


class Experience(Base):
    __tablename__ = "Experience"
    __table_args__ = (Index("Experience_publicationState_displayOrder_id_idx", "publicationState", "displayOrder", "id"),)

    id: Mapped[str] = mapped_column(primary_key=True)
    company: Mapped[str]
    role: Mapped[str]
    description: Mapped[str]
    start_date: Mapped[datetime] = mapped_column("startDate")
    end_date: Mapped[datetime | None] = mapped_column("endDate")
    display_order: Mapped[int] = mapped_column("displayOrder", default=0, server_default="0")
    publication_state: Mapped[str] = _publication_state()
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()


class Project(Base):
    __tablename__ = "Project"
    __table_args__ = (
        Index("Project_slug_key", "slug", unique=True),
        Index("Project_publicationState_displayOrder_id_idx", "publicationState", "displayOrder", "id"),
    )

    id: Mapped[str] = mapped_column(primary_key=True)
    slug: Mapped[str]
    name: Mapped[str]
    description: Mapped[str]
    url: Mapped[str | None]
    repository_url: Mapped[str | None] = mapped_column("repositoryUrl")
    is_featured: Mapped[bool] = mapped_column("isFeatured", default=False, server_default="false")
    display_order: Mapped[int] = mapped_column("displayOrder", default=0, server_default="0")
    publication_state: Mapped[str] = _publication_state()
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()

    technologies: Mapped[list[ProjectTechnology]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="(ProjectTechnology.display_order, ProjectTechnology.technology)",
    )


class ProjectTechnology(Base):
    __tablename__ = "ProjectTechnology"
    __table_args__ = (Index("ProjectTechnology_projectId_displayOrder_technology_idx", "projectId", "displayOrder", "technology"),)

    project_id: Mapped[str] = mapped_column(
        "projectId",
        ForeignKey("Project.id", name="ProjectTechnology_projectId_fkey", ondelete="CASCADE", onupdate="CASCADE"),
        primary_key=True,
    )
    technology: Mapped[str] = mapped_column(primary_key=True)
    display_order: Mapped[int] = mapped_column("displayOrder", default=0, server_default="0")

    project: Mapped[Project] = relationship(back_populates="technologies")


class Skill(Base):
    __tablename__ = "Skill"
    __table_args__ = (Index("Skill_publicationState_displayOrder_id_idx", "publicationState", "displayOrder", "id"),)

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
    category: Mapped[str]
    display_order: Mapped[int] = mapped_column("displayOrder", default=0, server_default="0")
    publication_state: Mapped[str] = _publication_state()
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()


class ResumeSettings(Base):
    __tablename__ = "ResumeSettings"
    __table_args__ = (Index("ResumeSettings_publicationState_id_idx", "publicationState", "id"),)

    id: Mapped[str] = mapped_column(primary_key=True)
    title: Mapped[str]
    intro: Mapped[str]
    resume_url: Mapped[str | None] = mapped_column("resumeUrl")
    publication_state: Mapped[str] = _publication_state()
    updated_at: Mapped[datetime] = _updated_at()


class ContactInquiry(Base):
    __tablename__ = "ContactInquiry"
    __table_args__ = (
        Index("ContactInquiry_status_createdAt_idx", "status", "createdAt"),
        Index("ContactInquiry_notificationStatus_createdAt_idx", "notificationStatus", "createdAt"),
    )

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
    email: Mapped[str]
    message: Mapped[str]
    opportunity_type: Mapped[str] = mapped_column("opportunityType", server_default="OTHER")
    source: Mapped[str]
    private_notes: Mapped[str] = mapped_column("privateNotes", default="", server_default="")
    status: Mapped[str] = mapped_column(default=InquiryStatus.NEW.value, server_default=InquiryStatus.NEW.value)
    notification_status: Mapped[str] = mapped_column(
        "notificationStatus", default=NotificationStatus.PENDING.value, server_default=NotificationStatus.PENDING.value
    )
    notification_error: Mapped[str | None] = mapped_column("notificationError")
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()
