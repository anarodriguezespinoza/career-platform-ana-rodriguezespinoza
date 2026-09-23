from sqlalchemy.exc import OperationalError

from app.domain.snapshot import parse_snapshot
from tests.test_snapshot import FIXTURE

VALID = {"name": "Release Checklist", "email": "release@example.com", "message": "Hello", "opportunityType": "PROJECT"}


def test_contact_accepts_valid_submissions(client):
    response = client.post("/api/contact", json=VALID, headers={"x-request-id": "req-1"})
    assert response.status_code == 201
    assert response.json() == {"message": "Thanks. Your message has been received."}
    assert response.headers["x-request-id"] == "req-1"


def test_contact_rejects_invalid_and_malformed_bodies(client):
    assert client.post("/api/contact", json={"name": "", "email": "not-an-email", "message": "", "opportunityType": "PROJECT"}).status_code == 400
    assert client.post("/api/contact", content=b"{not json", headers={"content-type": "application/json"}).status_code == 400


def test_contact_rate_limits_by_forwarded_client(client):
    headers = {"x-forwarded-for": "198.51.100.42, 10.0.0.1"}
    for _ in range(3):
        assert client.post("/api/contact", json=VALID, headers=headers).status_code == 201
    limited = client.post("/api/contact", json=VALID, headers=headers)
    assert limited.status_code == 429 and int(limited.headers["retry-after"]) > 0
    assert client.post("/api/contact", json=VALID, headers={"x-forwarded-for": "203.0.113.9"}).status_code == 201


def test_contact_reports_storage_failures_without_details(client, monkeypatch):
    def fail(*args, **kwargs):
        raise OperationalError("insert", {}, Exception("password=secret"))

    monkeypatch.setattr("app.routes.api.submit_inquiry", fail)
    response = client.post("/api/contact", json=VALID)
    assert response.status_code == 500 and "secret" not in response.text


def test_health_reports_database(client):
    response = client.get("/api/health", headers={"x-request-id": "health-123"})
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "up", "publicSource": "database"}
    assert response.headers["x-request-id"] == "health-123" and response.headers["cache-control"] == "no-store"


def test_health_degraded_and_unavailable(client, snapshot_store, monkeypatch):
    def fail():
        raise RuntimeError("database credentials should not be returned")

    monkeypatch.setattr("app.routes.api._select_one", fail)
    snapshot_store.snapshot = parse_snapshot(FIXTURE)
    degraded = client.get("/api/health")
    assert degraded.status_code == 200
    assert degraded.json() == {"status": "degraded", "database": "down", "publicSource": "snapshot"}

    snapshot_store.snapshot = None
    unavailable = client.get("/api/health")
    assert unavailable.status_code == 503
    assert unavailable.json() == {"status": "unavailable", "database": "down", "publicSource": "none"}


def test_health_times_out_slow_databases(client, monkeypatch):
    import time

    monkeypatch.setattr("app.routes.api.DATABASE_TIMEOUT_SECONDS", 0.05)
    monkeypatch.setattr("app.routes.api._select_one", lambda: time.sleep(0.5))
    assert client.get("/api/health").json()["database"] == "down"


def test_resume_pdf_download(client, seeded):
    response = client.get("/api/resume")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert 'filename="resume.pdf"' in response.headers["content-disposition"]
    assert response.content[:4] == b"%PDF"


def test_resume_unavailable_without_published_profile(client):
    response = client.get("/api/resume")
    assert response.status_code == 503 and response.text == "The published resume is temporarily unavailable"
