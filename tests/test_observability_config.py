import json

import pytest
from starlette.requests import Request

from app.config import EnvironmentConfigurationError, load_env
from app.db import normalize_database_url
from app.observability import create_logger, get_request_context, redact_log_fields


def test_logger_redacts_credentials_tokens_and_message_contents():
    output = []
    create_logger(output.append).error("contact_submission_failed", {
        "accessToken": "token-secret",
        "password": "password-secret",
        "authorization": "Bearer bearer-secret",
        "message": "This private inquiry must not be logged",
        "nested": {"clientSecret": "nested-secret", "note": "safe metadata"},
    })
    serialized = json.dumps(output)
    for secret in ("token-secret", "password-secret", "bearer-secret", "private inquiry", "nested-secret"):
        assert secret not in serialized
    assert output[0]["level"] == "error"
    assert output[0]["fields"]["nested"] == {"clientSecret": "[REDACTED]", "note": "safe metadata"}


def test_logger_preserves_safe_fields():
    assert redact_log_fields({"inquiryId": "inquiry-1", "operation": "publish"}) == {"inquiryId": "inquiry-1", "operation": "publish"}


def _request(headers: dict[str, str]) -> Request:
    return Request({"type": "http", "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()]})


def test_request_context_uses_supplied_id_or_generates_one():
    assert get_request_context(_request({"x-request-id": "req-123"})).request_id == "req-123"
    assert len(get_request_context(_request({})).request_id) == 36


REQUIRED = {
    "DATABASE_URL": "sqlite://",
    "COGNITO_ISSUER": "https://issuer",
    "COGNITO_CLIENT_ID": "client",
    "S3_SNAPSHOT_BUCKET": "bucket",
    "SES_FROM_EMAIL": "from@example.com",
    "SES_TO_EMAIL": "to@example.com",
}


def test_load_env_parses_admin_allowlist():
    env = load_env({**REQUIRED, "APP_ENV": "production", "COGNITO_ADMIN_EMAILS": " Owner@Example.com, ,second@example.com"})
    assert env.app_env == "production"
    assert env.cognito_admin_emails == ["owner@example.com", "second@example.com"]
    assert env.cognito_admin_subject is None


def test_load_env_reports_missing_variables():
    with pytest.raises(EnvironmentConfigurationError, match="COGNITO_ISSUER, SES_TO_EMAIL"):
        load_env({k: v for k, v in REQUIRED.items() if k not in ("COGNITO_ISSUER", "SES_TO_EMAIL")})


def test_load_env_rejects_unknown_environment():
    with pytest.raises(EnvironmentConfigurationError, match="APP_ENV"):
        load_env({**REQUIRED, "APP_ENV": "staging"})


@pytest.mark.parametrize(
    "url, expected",
    [
        ("file:./dev.db", "sqlite:///./dev.db"),
        ("postgresql://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
        ("postgres://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
        ("sqlite:///x.db", "sqlite:///x.db"),
    ],
)
def test_normalizes_prisma_style_database_urls(url, expected):
    assert normalize_database_url(url) == expected
