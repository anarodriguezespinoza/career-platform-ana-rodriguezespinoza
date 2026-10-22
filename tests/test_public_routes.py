from app import models
from app.domain.snapshot import parse_snapshot
from tests.test_snapshot import FIXTURE


def test_home_renders_published_content_only(client, seeded):
    response = client.get("/")
    assert response.status_code == 200
    assert "Ana Rodriguez" in response.text and "Published project" in response.text
    assert "Archived project" not in response.text
    assert '<link rel="canonical" href="https://ana.example.com/">' in response.text
    assert "Showing the latest published information" not in response.text


def test_pages_render(client, seeded):
    assert "Mar 2022 — Present" in client.get("/experience").text
    assert "Languages" in client.get("/skills").text
    assert "ana@example.com" in client.get("/about").text
    detail = client.get("/projects/published-project")
    assert detail.status_code == 200
    assert detail.text.index("FastAPI") < detail.text.index("Python")
    assert "<title>Published project — Ana Rodriguez</title>" in detail.text


def test_unknown_archived_and_malformed_projects_are_not_found(client, seeded):
    for slug in ("missing", "archived-project", "..%2Fprivate", "Bad_Slug"):
        assert client.get(f"/projects/{slug}").status_code == 404


def test_drafts_are_not_public(client, session):
    from tests.conftest import seed_content

    seed_content(session, state="DRAFT")
    response = client.get("/")
    assert "Builds useful systems." not in response.text
    assert "Ana Rodriguez" in response.text  # the fallback heading


def test_resume_page_links_to_generated_pdf(client, seeded):
    assert 'href="/api/resume"' in client.get("/resume").text


def test_falls_back_to_snapshot_when_database_is_unavailable(client, snapshot_store, monkeypatch):
    snapshot_store.snapshot = parse_snapshot(FIXTURE)
    monkeypatch.setattr("app.repositories.ContentRepository.list_published", lambda self: (_ for _ in ()).throw(RuntimeError("down")))
    response = client.get("/")
    assert response.status_code == 200
    assert "Showing the latest published information while live updates are temporarily unavailable." in response.text
    assert "Ana Rodriguez Espinoza" in response.text
    assert 'href="/api/resume"' not in client.get("/resume").text


def _fail_database(monkeypatch):
    monkeypatch.setattr("app.repositories.ContentRepository.list_published", lambda self: (_ for _ in ()).throw(RuntimeError("down")))


def test_shows_unavailable_page_when_no_source_works(client, monkeypatch):
    _fail_database(monkeypatch)
    response = client.get("/experience")
    assert response.status_code == 503 and "Please try again shortly." in response.text


def test_database_failure_keeps_profile_visible_and_returns_503(client, seeded, monkeypatch):
    _fail_database(monkeypatch)
    for path in ("/", "/projects", "/about"):
        response = client.get(path)
        assert response.status_code == 503, path
        assert "Published project" not in response.text, path
    for path in ("/", "/about"):
        assert "Ana Rodriguez Espinoza" in client.get(path).text, path
    assert "Projects temporarily unavailable" in client.get("/").text
    assert "Projects temporarily unavailable" in client.get("/projects").text


def test_recovers_without_restart_when_database_returns(client, seeded, monkeypatch):
    with monkeypatch.context() as outage:
        _fail_database(outage)
        assert client.get("/projects").status_code == 503
    response = client.get("/projects")
    assert response.status_code == 200
    assert "Published project" in response.text and "Projects temporarily unavailable" not in response.text


def test_empty_projects_table_shows_empty_state(client):
    for path in ("/", "/projects"):
        response = client.get(path)
        assert response.status_code == 200, path
        assert "No projects are published yet." in response.text, path


def test_missing_profile_row_shows_no_invented_text(client):
    home, about = client.get("/").text, client.get("/about").text
    for invented in ("Building thoughtful digital products", "A portfolio of experience, projects, and skills.", "hello@example.com", "Available remotely", "Professional summary unavailable."):
        assert invented not in home and invented not in about, invented
    assert "Ana Rodriguez Espinoza" in home


def test_profile_shows_education_and_links(client, seeded):
    for path in ("/", "/about"):
        html = client.get(path).text
        assert "Loyola Marymount University" in html, path
        assert 'href="https://www.linkedin.com/in/ana-rodriguezespinoza"' in html, path
        assert 'href="https://github.com/anarodriguezespinoza"' in html, path


def test_robots_and_sitemap(client, seeded):
    robots = client.get("/robots.txt").text
    assert "Disallow: /admin" in robots and "Sitemap: https://ana.example.com/sitemap.xml" in robots
    sitemap = client.get("/sitemap.xml").text
    assert "<loc>https://ana.example.com/projects/published-project</loc>" in sitemap
    assert "archived-project" not in sitemap


def test_privacy_page_renders_and_is_linked(client, seeded):
    response = client.get("/privacy")
    assert response.status_code == 200
    assert "<title>Privacy — Ana Rodriguez</title>" in response.text
    assert "_ga_JH0KBKW3K9" in response.text
    assert 'href="/privacy"' in client.get("/").text
    assert "<loc>https://ana.example.com/privacy</loc>" in client.get("/sitemap.xml").text


def test_contact_form_submission_and_errors(client, session):
    valid = {"name": "Visitor", "email": "v@example.com", "opportunityType": "SPEAKING", "message": "Hello"}
    response = client.post("/contact", data=valid)
    assert response.status_code == 200 and "Thanks. Your message has been received." in response.text
    assert session.query(models.ContactInquiry).one().opportunity_type == "SPEAKING"

    invalid = client.post("/contact", data={**valid, "email": "nope"})
    assert invalid.status_code == 400
    assert "Please check your details and try again." in invalid.text and 'value="Visitor"' in invalid.text


def test_analytics_consent_loads_once_on_public_pages_only(client, admin_client, seeded):
    for path in ("/", "/about", "/contact", "/privacy", "/projects/missing"):
        html = client.get(path).text
        assert html.count('data-measurement-id="G-JH0KBKW3K9"') == 1, path
        assert html.count('id="analytics-consent"') == 1, path
        assert "googletagmanager.com" not in html, path  # gtag.js is only requested after consent
    for html in (client.get("/sign-in").text, admin_client.get("/admin").text):
        assert "analytics-consent" not in html and "G-JH0KBKW3K9" not in html
