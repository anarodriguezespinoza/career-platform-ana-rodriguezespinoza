from __future__ import annotations

import os
import time
from collections.abc import Iterator
from datetime import datetime
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

TEST_ENV = {
    "APP_ENV": "test",
    "COGNITO_ISSUER": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test",
    "COGNITO_CLIENT_ID": "test-client",
    "COGNITO_ADMIN_EMAILS": "owner@example.com",
    "S3_SNAPSHOT_BUCKET": "test-snapshots",
    "SES_FROM_EMAIL": "from@example.com",
    "SES_TO_EMAIL": "to@example.com",
    "SITE_URL": "https://ana.example.com",
    "AWS_EC2_METADATA_DISABLED": "true",
}
os.environ.update(TEST_ENV)
os.environ.setdefault("DATABASE_URL", "sqlite://")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app import auth, db, models  # noqa: E402
from app.domain import inquiries  # noqa: E402
from app.domain.snapshot import PublishedSnapshot  # noqa: E402


@pytest.fixture(autouse=True)
def database(tmp_path, monkeypatch) -> Iterator[None]:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    db.get_engine.cache_clear()
    db.get_session_factory.cache_clear()
    models.Base.metadata.create_all(db.get_engine())
    yield
    db.get_engine().dispose()
    db.get_engine.cache_clear()
    db.get_session_factory.cache_clear()


@pytest.fixture
def session() -> Iterator[Session]:
    with db.get_session_factory()() as session:
        yield session


@pytest.fixture(autouse=True)
def reset_rate_limiter() -> None:
    inquiries.inquiry_rate_limiter.clear()


@pytest.fixture(autouse=True)
def notifications(monkeypatch) -> list[inquiries.InquiryNotification]:
    sent: list[inquiries.InquiryNotification] = []
    monkeypatch.setattr(inquiries, "send_inquiry_notification", sent.append)
    return sent


class InMemorySnapshotStore:
    def __init__(self, snapshot: PublishedSnapshot | None = None, fail: bool = False) -> None:
        self.snapshot = snapshot
        self.fail = fail
        self.writes: list[PublishedSnapshot] = []

    def read(self) -> PublishedSnapshot | None:
        if self.fail:
            raise RuntimeError("snapshot unavailable")
        return self.snapshot

    def write(self, snapshot: PublishedSnapshot) -> None:
        self.writes.append(snapshot)
        self.snapshot = snapshot


@pytest.fixture(autouse=True)
def snapshot_store(monkeypatch) -> InMemorySnapshotStore:
    store = InMemorySnapshotStore()
    from app import public_content
    from app.routes import admin, api

    for module in (public_content, api, admin):
        monkeypatch.setattr(module, "get_runtime_snapshot_store", lambda *args, **kwargs: store)
    return store


@pytest.fixture
def client() -> TestClient:
    from app.main import app

    return TestClient(app)


# --- Cognito tokens ------------------------------------------------------------------

_PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(autouse=True)
def cognito_keys(monkeypatch) -> None:
    signing_key = SimpleNamespace(key=_PRIVATE_KEY.public_key())
    monkeypatch.setattr(auth, "_jwks_client", lambda issuer: SimpleNamespace(get_signing_key_from_jwt=lambda token: signing_key))


def make_token(email: str = "owner@example.com", subject: str = "owner-sub", **overrides) -> str:
    now = int(time.time())
    claims = {
        "sub": subject,
        "email": email,
        "token_use": "id",
        "iss": TEST_ENV["COGNITO_ISSUER"],
        "aud": TEST_ENV["COGNITO_CLIENT_ID"],
        "iat": now,
        "exp": now + 3600,
        **overrides,
    }
    return jwt.encode({k: v for k, v in claims.items() if v is not None}, _PRIVATE_KEY, algorithm="RS256")


@pytest.fixture
def admin_client(client: TestClient) -> TestClient:
    client.cookies.set(auth.SESSION_COOKIE, make_token())
    return client


# --- Content -----------------------------------------------------------------------


def seed_content(session: Session, state: str = "PUBLISHED") -> None:
    session.add_all([
        models.Profile(id="profile-1", name="Ana Rodriguez", headline="Product-minded engineer", summary="Builds useful systems.", email="ana@example.com", location="Remote", publication_state=state),
        models.Experience(id="experience-1", company="Acme", role="Engineer", description="Shipped things.", start_date=datetime(2022, 3, 1), end_date=None, display_order=0, publication_state=state),
        models.Project(
            id="project-1", slug="published-project", name="Published project", description="A published project.", display_order=0, publication_state=state,
            technologies=[models.ProjectTechnology(technology="Python", display_order=1), models.ProjectTechnology(technology="FastAPI", display_order=0)],
        ),
        models.Project(id="project-2", slug="archived-project", name="Archived project", description="Hidden.", display_order=1, publication_state="ARCHIVED"),
        models.Skill(id="skill-1", name="Python", category="Languages", display_order=0, publication_state=state),
        models.ResumeSettings(id="resume-1", title="Ana's Resume", intro="Resume intro.", publication_state=state),
    ])
    session.commit()


@pytest.fixture
def seeded(session: Session) -> Session:
    seed_content(session)
    return session
