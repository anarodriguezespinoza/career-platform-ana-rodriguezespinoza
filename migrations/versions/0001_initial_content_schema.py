"""Initial content schema (equivalent to the final Prisma migration state).

Databases previously managed by Prisma already have this schema: run
`alembic stamp 0001` on them instead of upgrading.

Revision ID: 0001
Revises:
Create Date: 2026-09-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def _timestamps(created: bool = True) -> list[sa.Column]:
    columns = [sa.Column("updatedAt", sa.DateTime(), nullable=False)]
    if created:
        columns.insert(0, sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()))
    return columns


def _publication_state() -> sa.Column:
    return sa.Column("publicationState", sa.Text(), nullable=False, server_default="DRAFT")


def upgrade() -> None:
    op.create_table(
        "Profile",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("headline", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("location", sa.Text(), nullable=False),
        sa.Column("avatarUrl", sa.Text()),
        _publication_state(),
        *_timestamps(),
    )
    op.create_table(
        "Experience",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("company", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("startDate", sa.DateTime(), nullable=False),
        sa.Column("endDate", sa.DateTime()),
        sa.Column("displayOrder", sa.Integer(), nullable=False, server_default="0"),
        _publication_state(),
        *_timestamps(),
    )
    op.create_index("Experience_publicationState_displayOrder_id_idx", "Experience", ["publicationState", "displayOrder", "id"])
    op.create_table(
        "Project",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("url", sa.Text()),
        sa.Column("repositoryUrl", sa.Text()),
        sa.Column("isFeatured", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("displayOrder", sa.Integer(), nullable=False, server_default="0"),
        _publication_state(),
        *_timestamps(),
    )
    op.create_index("Project_slug_key", "Project", ["slug"], unique=True)
    op.create_index("Project_publicationState_displayOrder_id_idx", "Project", ["publicationState", "displayOrder", "id"])
    op.create_table(
        "ProjectTechnology",
        sa.Column("projectId", sa.Text(), nullable=False),
        sa.Column("technology", sa.Text(), nullable=False),
        sa.Column("displayOrder", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("projectId", "technology"),
        sa.ForeignKeyConstraint(["projectId"], ["Project.id"], name="ProjectTechnology_projectId_fkey", ondelete="CASCADE", onupdate="CASCADE"),
    )
    op.create_index("ProjectTechnology_projectId_displayOrder_technology_idx", "ProjectTechnology", ["projectId", "displayOrder", "technology"])
    op.create_table(
        "Skill",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("displayOrder", sa.Integer(), nullable=False, server_default="0"),
        _publication_state(),
        *_timestamps(),
    )
    op.create_index("Skill_publicationState_displayOrder_id_idx", "Skill", ["publicationState", "displayOrder", "id"])
    op.create_table(
        "ResumeSettings",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("intro", sa.Text(), nullable=False),
        sa.Column("resumeUrl", sa.Text()),
        _publication_state(),
        *_timestamps(created=False),
    )
    op.create_index("ResumeSettings_publicationState_id_idx", "ResumeSettings", ["publicationState", "id"])
    op.create_table(
        "ContactInquiry",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("opportunityType", sa.Text(), nullable=False, server_default="OTHER"),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("privateNotes", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.Text(), nullable=False, server_default="NEW"),
        sa.Column("notificationStatus", sa.Text(), nullable=False, server_default="PENDING"),
        sa.Column("notificationError", sa.Text()),
        *_timestamps(),
    )
    op.create_index("ContactInquiry_status_createdAt_idx", "ContactInquiry", ["status", "createdAt"])
    op.create_index("ContactInquiry_notificationStatus_createdAt_idx", "ContactInquiry", ["notificationStatus", "createdAt"])


def downgrade() -> None:
    for table in ("ContactInquiry", "ResumeSettings", "Skill", "ProjectTechnology", "Project", "Experience", "Profile"):
        op.drop_table(table)
