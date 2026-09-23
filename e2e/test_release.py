import json
import os
import re
from pathlib import Path

from playwright.sync_api import APIRequestContext, Page, expect

from e2e.conftest import sign_in_as_admin, unique_inquiry_message


def test_admin_previews_publishes_and_sees_public_result(page: Page) -> None:
    sign_in_as_admin(page)
    page.get_by_role("link", name="Content").click()
    page.get_by_role("link", name=re.compile("profile-ana")).click()
    name = f"Ana Rodriguez E2E {page.evaluate('Date.now()')}"
    page.get_by_label("Name", exact=True).fill(name)
    page.get_by_role("button", name="Save draft").click()
    expect(page.get_by_role("status")).to_have_text("Draft saved")

    page.get_by_role("link", name="Preview").click()
    expect(page.get_by_role("heading", name="Draft preview")).to_be_visible()
    expect(page.get_by_text(name)).to_be_visible()

    page.goto("/")
    expect(page.get_by_role("heading", name=name)).not_to_be_visible()

    page.goto("/admin")
    page.get_by_role("button", name="Publish all drafts").click()
    expect(page.get_by_role("status")).to_have_text("Published")

    page.goto("/")
    expect(page.get_by_role("heading", name=name)).to_be_visible()


def test_visitor_submits_contact_inquiry(page: Page) -> None:
    page.goto("/contact")
    page.get_by_label("Name").fill("Playwright Visitor")
    page.get_by_label("Email").fill("playwright@example.com")
    page.get_by_label("What brings you here?").select_option("PROJECT")
    page.get_by_label("Message").fill(unique_inquiry_message())
    page.get_by_role("button", name="Send message").click()
    expect(page.get_by_role("status")).to_have_text("Thanks. Your message has been received.", timeout=30_000)


def test_admin_views_updates_and_deletes_inquiry(page: Page) -> None:
    message = unique_inquiry_message()
    response = page.request.post("/api/contact", data={"name": "Playwright Admin Flow", "email": "playwright-admin@example.com", "opportunityType": "COLLABORATION", "message": message})
    assert response.ok

    sign_in_as_admin(page)
    page.get_by_role("link", name="Inquiries").click()
    page.get_by_role("link", name="Playwright Admin Flow").first.click()
    expect(page.get_by_text(message)).to_be_visible()

    page.get_by_label("Status").select_option("REPLIED")
    page.get_by_role("button", name="Update status").click()
    expect(page.get_by_label("Status")).to_have_value("REPLIED")

    page.get_by_label("Private notes").fill("Reviewed by Playwright release gate")
    page.get_by_role("button", name="Save notes").click()
    expect(page.get_by_label("Private notes")).to_have_value("Reviewed by Playwright release gate")

    page.once("dialog", lambda dialog: dialog.accept())
    page.get_by_role("button", name="Delete inquiry").click()
    expect(page).to_have_url(re.compile(r"/admin/inquiries/?$"))
    expect(page.get_by_text(message)).not_to_be_visible()


def test_unknown_project_returns_404(page: Page) -> None:
    assert page.request.get("/projects/project-that-does-not-exist").status == 404


def test_published_resume_downloads_as_pdf(page: Page) -> None:
    response = page.request.get("/api/resume")
    assert response.status == 200
    assert "application/pdf" in response.headers["content-type"]
    assert 'filename="resume.pdf"' in response.headers["content-disposition"]
    assert response.body()[:4] == b"%PDF"


def test_contact_rejects_invalid_data_and_rate_limits(page: Page) -> None:
    request: APIRequestContext = page.request
    assert request.post("/api/contact", data={"name": "", "email": "not-an-email", "message": "", "opportunityType": "PROJECT"}).status == 400

    headers = {"x-forwarded-for": "198.51.100.42"}
    payload = {"name": "Release Checklist", "email": "release-checklist@example.com", "message": unique_inquiry_message(), "opportunityType": "PROJECT"}
    for _ in range(3):
        assert request.post("/api/contact", headers=headers, data=payload).status == 201
    limited = request.post("/api/contact", headers=headers, data=payload)
    assert limited.status == 429 and limited.headers.get("retry-after")


def test_health_is_database_backed(page: Page) -> None:
    response = page.request.get("/api/health")
    assert response.status == 200
    assert response.json() == {"status": "ok", "database": "up", "publicSource": "database"}


def test_fallback_deployment_serves_snapshot(page: Page) -> None:
    fixture = json.loads((Path(__file__).parent / "public-content.json").read_text())
    page.goto(os.environ["E2E_FALLBACK_BASE_URL"].rstrip("/") + "/")
    expect(page.get_by_role("status")).to_have_text("Showing the latest published information while live updates are temporarily unavailable.")
    expect(page.get_by_role("heading", name=fixture["content"]["profile"]["name"])).to_be_visible()
