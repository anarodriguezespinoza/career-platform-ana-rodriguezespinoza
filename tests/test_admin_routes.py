import pytest

from app import models
from app.auth import SESSION_COOKIE
from tests.conftest import make_token, seed_content


@pytest.mark.parametrize("path", ["/admin", "/admin/content", "/admin/preview", "/admin/inquiries", "/admin/resume", "/admin/content/profile/profile-1"])
def test_admin_pages_redirect_anonymous_visitors_to_sign_in(client, path):
    response = client.get(path, follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"] == f"/sign-in?returnTo={path}"


def test_admin_pages_reject_non_allowlisted_users(client):
    client.cookies.set(SESSION_COOKIE, make_token(email="stranger@example.com", subject="stranger"))
    assert client.get("/admin", follow_redirects=False).status_code == 303


def test_admin_actions_require_sign_in(client, seeded):
    response = client.post("/admin/publish", follow_redirects=False)
    assert response.status_code == 303 and response.headers["location"].startswith("/sign-in")


def test_admin_rejects_cross_origin_posts(admin_client, seeded):
    response = admin_client.post("/admin/publish", headers={"Origin": "https://evil.example.com"})
    assert response.status_code == 403


def test_dashboard_renders_navigation(admin_client):
    response = admin_client.get("/admin")
    assert response.status_code == 200
    assert 'aria-label="Admin navigation"' in response.text
    assert "Publish all drafts" in response.text


def test_content_list_and_unknown_records(admin_client, seeded):
    listing = admin_client.get("/admin/content")
    assert "profile-1 (PUBLISHED)" in listing.text and "project-2 (ARCHIVED)" in listing.text
    assert admin_client.get("/admin/content/profile/missing").status_code == 404
    assert admin_client.get("/admin/content/unknown/profile-1").status_code == 404


def test_save_draft_then_publish_updates_public_site_and_snapshot(admin_client, seeded, snapshot_store):
    form = {"name": "Ana Draft", "headline": "Engineer", "summary": "Summary", "email": "ana@example.com", "location": "Remote", "avatarUrl": ""}
    saved = admin_client.post("/admin/content/profile/profile-1", data=form)
    assert saved.status_code == 200 and "Draft saved" in saved.text

    seeded.expire_all()
    profile = seeded.get(models.Profile, "profile-1")
    assert (profile.name, profile.publication_state, profile.avatar_url) == ("Ana Draft", "DRAFT", None)
    assert "Ana Draft" in admin_client.get("/admin/preview").text
    assert "Ana Draft" not in admin_client.get("/").text

    published = admin_client.post("/admin/publish")
    assert published.status_code == 200 and "Published" in published.text
    assert "Ana Draft" in admin_client.get("/").text
    assert snapshot_store.writes[-1].content.profile.name == "Ana Draft"
    assert [p.slug for p in snapshot_store.writes[-1].content.projects] == ["published-project"]


def test_save_project_draft_replaces_technologies(admin_client, seeded):
    form = {"slug": "published-project", "name": "P", "description": "D", "url": "https://example.com", "repositoryUrl": "", "technologies": "Go, Rust, Go", "isFeatured": "on", "displayOrder": "3"}
    assert admin_client.post("/admin/content/project/project-1", data=form).status_code == 200
    seeded.expire_all()
    project = seeded.get(models.Project, "project-1")
    assert [t.technology for t in project.technologies] == ["Go", "Rust"]
    assert (project.is_featured, project.display_order, project.url, project.repository_url) == (True, 3, "https://example.com", None)


def test_save_draft_validation_errors_keep_submitted_values(admin_client, seeded):
    form = {"company": "Acme", "role": "", "description": "D", "startDate": "2022-01-01", "endDate": "", "displayOrder": "0"}
    response = admin_client.post("/admin/content/experience/experience-1", data=form)
    assert response.status_code == 400
    assert "Unable to save draft: experience.role is required" in response.text

    form = {**form, "role": "Engineer", "startDate": "not-a-date"}
    response = admin_client.post("/admin/content/experience/experience-1", data=form)
    assert response.status_code == 400 and "experience.startDate must be a valid date" in response.text


def test_publish_is_blocked_by_invalid_drafts(admin_client, seeded, snapshot_store):
    seeded.get(models.Skill, "skill-1").name = " "
    seeded.commit()
    response = admin_client.post("/admin/publish")
    assert response.status_code == 400
    assert "Unable to publish: skills[0].name is required" in response.text
    assert snapshot_store.writes == []


def test_unpublish_and_archive(admin_client, seeded, snapshot_store):
    response = admin_client.post("/admin/content/project/project-1/unpublish")
    assert response.status_code == 200 and "Unpublished" in response.text
    assert snapshot_store.writes[-1].content.projects == []
    assert admin_client.get("/projects/published-project").status_code == 404

    response = admin_client.post("/admin/content/project/project-1/archive")
    assert "Archived" in response.text
    seeded.expire_all()
    assert seeded.get(models.Project, "project-1").publication_state == "ARCHIVED"


def test_inquiry_admin_workflow(admin_client, client):
    admin_client.post("/api/contact", json={"name": "Visitor", "email": "v@example.com", "opportunityType": "COLLABORATION", "message": "Private hello"})
    listing = admin_client.get("/admin/inquiries")
    assert "Visitor" in listing.text and "COLLABORATION" in listing.text

    from app.db import get_session_factory

    with get_session_factory()() as session:
        inquiry_id = session.query(models.ContactInquiry).one().id

    detail = admin_client.get(f"/admin/inquiries/{inquiry_id}")
    assert "Private hello" in detail.text

    admin_client.post(f"/admin/inquiries/{inquiry_id}/status", data={"status": "REPLIED"})
    admin_client.post(f"/admin/inquiries/{inquiry_id}/notes", data={"privateNotes": "Followed up"})
    detail = admin_client.get(f"/admin/inquiries/{inquiry_id}")
    assert "<option selected>REPLIED</option>" in detail.text and "Followed up" in detail.text

    assert admin_client.post(f"/admin/inquiries/{inquiry_id}/status", data={"status": "IN_PROGRESS"}).status_code == 404

    deleted = admin_client.post(f"/admin/inquiries/{inquiry_id}/delete", follow_redirects=False)
    assert deleted.headers["location"] == "/admin/inquiries"
    assert admin_client.get(f"/admin/inquiries/{inquiry_id}").status_code == 404
    assert "No inquiries yet." in admin_client.get("/admin/inquiries").text


def test_admin_resume_generation_returns_pdf(admin_client, session):
    seed_content(session)
    response = admin_client.post("/admin/resume")
    assert response.status_code == 200 and response.content.startswith(b"%PDF")


def test_admin_resume_generation_reports_missing_content(admin_client):
    response = admin_client.post("/admin/resume")
    assert response.status_code == 503 and "temporarily unavailable" in response.text
