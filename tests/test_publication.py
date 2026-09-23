from dataclasses import replace
from datetime import datetime

import pytest

from app.domain.content import (
    ContentNotPublishableError,
    EditableContent,
    EditableExperience,
    EditableProfile,
    EditableProject,
    EditableResumeSettings,
    EditableSkill,
    ProjectTechnology,
    build_public_content,
    mark_publishable_records,
    validate_publishable_content,
)


def content(state: str = "PUBLISHED") -> EditableContent:
    return EditableContent(
        profile=EditableProfile(id="p", name="Ana", headline="Engineer", summary="Summary", email="ana@example.com", location="Remote", avatar_url=None, publication_state=state),
        experience=[
            EditableExperience(id="b", company="B", role="R", description="D", start_date=datetime(2021, 1, 1), end_date=None, display_order=1, publication_state=state),
            EditableExperience(id="a", company="A", role="R", description="D", start_date=datetime(2020, 1, 1), end_date=datetime(2021, 1, 1), display_order=1, publication_state=state),
        ],
        projects=[
            EditableProject(
                id="proj", slug="proj", name="Project", description="Desc", url=None, repository_url=None, is_featured=False, display_order=0, publication_state=state,
                technologies=[ProjectTechnology("proj", "Zeta", 1), ProjectTechnology("proj", "Alpha", 1), ProjectTechnology("proj", "First", 0)],
            ),
            EditableProject(id="draft", slug="draft", name="Draft", description="Desc", url=None, repository_url=None, is_featured=False, display_order=0, publication_state="DRAFT"),
        ],
        skills=[EditableSkill(id="s", name="Python", category="Languages", display_order=0, publication_state="ARCHIVED")],
        resume_settings=EditableResumeSettings(id="r", title="Resume", intro="Intro", resume_url=None, publication_state=state),
    )


def test_build_public_content_exposes_only_published_records_in_display_order():
    public = build_public_content(content())

    assert public.profile is not None and public.profile.name == "Ana"
    assert [item.id for item in public.experience] == ["a", "b"]
    assert [project.id for project in public.projects] == ["proj"]
    assert [t.technology for t in public.projects[0].technologies] == ["First", "Alpha", "Zeta"]
    assert public.skills == []
    assert public.resume_settings is not None and public.resume_settings.title == "Resume"
    assert not hasattr(public.profile, "publication_state")


def test_unpublished_profile_and_resume_are_hidden():
    public = build_public_content(content("DRAFT"))
    assert public.profile is None and public.resume_settings is None and public.projects == []


def test_validation_reports_missing_fields_on_published_records():
    records = content()
    records = replace(records, profile=replace(records.profile, name="  "), projects=[replace(records.projects[0], slug="")])

    assert validate_publishable_content(records) == ["profile.name is required", "projects[0].slug is required"]
    with pytest.raises(ContentNotPublishableError):
        build_public_content(records)


def test_validation_ignores_invalid_drafts():
    records = content()
    records = replace(records, projects=[replace(records.projects[1], name="")])
    assert validate_publishable_content(records) == []


def test_mark_publishable_records_keeps_archived_records_archived():
    marked = mark_publishable_records(content("DRAFT"))
    assert marked.profile.publication_state == "PUBLISHED"
    assert all(project.publication_state == "PUBLISHED" for project in marked.projects)
    assert marked.skills[0].publication_state == "ARCHIVED"
