import json
import re
from datetime import datetime

import pytest

from app.domain.content import PublicContent, PublicExperience, PublicProfile
from app.domain.snapshot import (
    PublicContentUnavailableError,
    PublicSnapshotConfigurationError,
    S3SnapshotStore,
    SnapshotValidationError,
    create_snapshot,
    get_runtime_snapshot_store,
    parse_snapshot,
    read_public_content,
    snapshot_to_json,
)
from tests.conftest import InMemorySnapshotStore

FIXTURE = {
    "schemaVersion": 1,
    "generatedAt": "2026-09-17T00:00:00.000Z",
    "content": {
        "profile": {"id": "profile-ana", "name": "Ana Rodriguez Espinoza", "headline": "Software Engineer", "summary": "Summary", "email": "ana@example.com", "location": "Remote", "avatarUrl": None},
        "experience": [{"id": "e", "company": "C", "role": "R", "description": "D", "startDate": "2024-01-01T00:00:00.000Z", "endDate": None, "displayOrder": 0}],
        "projects": [{"id": "p", "slug": "p", "name": "P", "description": "D", "url": None, "repositoryUrl": None, "displayOrder": 0, "technologies": [{"projectId": "p", "technology": "Python", "displayOrder": 0}]}],
        "skills": [],
        "resumeSettings": {"id": "r", "title": "T", "intro": "I", "resumeUrl": None},
    },
}


def test_parses_version_1_snapshots_and_defaults_is_featured():
    snapshot = parse_snapshot(FIXTURE)
    assert snapshot.schema_version == 2
    assert snapshot.content.projects[0].is_featured is False
    assert snapshot.content.experience[0].start_date == datetime(2024, 1, 1)


def test_round_trips_through_json_in_the_shared_format():
    serialized = snapshot_to_json(parse_snapshot(FIXTURE))
    assert serialized["schemaVersion"] == 2
    assert serialized["content"]["experience"][0]["startDate"] == "2024-01-01T00:00:00.000Z"
    assert serialized["content"]["projects"][0]["isFeatured"] is False
    assert parse_snapshot(json.loads(json.dumps(serialized))) == parse_snapshot(serialized)


@pytest.mark.parametrize(
    "mutate, message",
    [
        (lambda s: s["content"]["profile"].update(privateNotes="x"), "content.profile contains unsupported or missing fields"),
        (lambda s: s.update(schemaVersion=3), "unsupported snapshot schema version"),
        (lambda s: s["content"]["experience"][0].update(startDate="not a date"), "content.experience[0].startDate must be a valid date"),
        (lambda s: s["content"]["projects"][0].update(displayOrder=-1), "content.projects[0].displayOrder must be a non-negative integer"),
        (lambda s: s.update(generatedAt=5), "generatedAt must be an ISO date"),
    ],
)
def test_rejects_invalid_snapshots(mutate, message):
    snapshot = json.loads(json.dumps(FIXTURE))
    mutate(snapshot)
    with pytest.raises(SnapshotValidationError, match=re.escape(message)):
        parse_snapshot(snapshot)


def test_create_snapshot_stamps_generation_time():
    content = PublicContent(profile=None, experience=[PublicExperience("e", "C", "R", "D", datetime(2024, 1, 1), None, 0)], projects=[], skills=[], resume_settings=None)
    snapshot = create_snapshot(content)
    assert snapshot.generated_at.endswith("Z")
    assert snapshot.content == content


class FakeS3:
    def __init__(self, body: bytes | None = None, error: Exception | None = None) -> None:
        self.body, self.error, self.puts = body, error, []

    def get_object(self, Bucket, Key):  # noqa: N803
        if self.error:
            raise self.error
        return {"Body": type("Body", (), {"read": lambda _: self.body})()}

    def put_object(self, **kwargs):
        self.puts.append(kwargs)


class NoSuchKeyError(Exception):
    response = {"Error": {"Code": "NoSuchKey"}}


def test_s3_store_reads_validates_and_writes():
    s3 = FakeS3(json.dumps(FIXTURE).encode())
    store = S3SnapshotStore(s3, "bucket", "public/content.json")
    snapshot = store.read()
    assert snapshot.content.profile.name == "Ana Rodriguez Espinoza"

    store.write(snapshot)
    assert s3.puts[0]["Bucket"] == "bucket" and s3.puts[0]["Key"] == "public/content.json"
    assert s3.puts[0]["ContentType"] == "application/json"
    assert json.loads(s3.puts[0]["Body"])["schemaVersion"] == 2


def test_s3_store_returns_none_for_missing_object_and_raises_otherwise():
    assert S3SnapshotStore(FakeS3(error=NoSuchKeyError()), "b").read() is None
    with pytest.raises(RuntimeError):
        S3SnapshotStore(FakeS3(error=RuntimeError("denied")), "b").read()


def test_runtime_store_requires_a_bucket():
    with pytest.raises(PublicSnapshotConfigurationError, match="published snapshot store is not configured"):
        get_runtime_snapshot_store(env={})
    assert isinstance(get_runtime_snapshot_store(env={"S3_SNAPSHOT_BUCKET": "b"}, client=FakeS3()), S3SnapshotStore)


def _empty_live():
    from app.domain.content import EditableContent

    return EditableContent(profile=None, experience=[], projects=[], skills=[], resume_settings=None)


def test_reader_does_not_touch_the_snapshot_store_on_a_healthy_read():
    def store_factory():
        raise AssertionError("snapshot store should not be created")

    content, source = read_public_content(_empty_live, store_factory)
    assert source == "database" and content.profile is None


def test_reader_falls_back_to_snapshot_when_database_fails():
    snapshot = parse_snapshot(FIXTURE)

    def failing_live():
        raise RuntimeError("database down")

    content, source = read_public_content(failing_live, lambda: InMemorySnapshotStore(snapshot))
    assert source == "snapshot" and content == snapshot.content


@pytest.mark.parametrize("store", [InMemorySnapshotStore(None), InMemorySnapshotStore(fail=True)])
def test_reader_raises_when_neither_source_is_available(store):
    def failing_live():
        raise RuntimeError("database down")

    with pytest.raises(PublicContentUnavailableError):
        read_public_content(failing_live, lambda: store)


def test_public_profile_type_has_no_private_fields():
    assert "publication_state" not in PublicProfile.__dataclass_fields__
