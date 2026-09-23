"""Environment configuration for the career platform."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

AppEnvironment = Literal["development", "test", "production"]

REQUIRED_VARIABLES = (
    "DATABASE_URL",
    "COGNITO_ISSUER",
    "COGNITO_CLIENT_ID",
    "S3_SNAPSHOT_BUCKET",
    "SES_FROM_EMAIL",
    "SES_TO_EMAIL",
)


class EnvironmentConfigurationError(Exception):
    def __init__(self, missing_variables: list[str]) -> None:
        super().__init__(f"Missing required environment variables: {', '.join(missing_variables)}")


@dataclass(frozen=True)
class AppEnv:
    app_env: AppEnvironment
    database_url: str
    cognito_issuer: str
    cognito_client_id: str
    cognito_admin_subject: str | None
    cognito_admin_emails: list[str]
    snapshot_bucket: str
    ses_from_email: str
    ses_to_email: str


def load_env(source: Mapping[str, str] | None = None) -> AppEnv:
    source = os.environ if source is None else source
    missing = [name for name in REQUIRED_VARIABLES if not source.get(name)]
    if missing:
        raise EnvironmentConfigurationError(missing)

    return AppEnv(
        app_env=_normalize_app_environment(source.get("APP_ENV", "development")),
        database_url=source["DATABASE_URL"],
        cognito_issuer=source["COGNITO_ISSUER"],
        cognito_client_id=source["COGNITO_CLIENT_ID"],
        cognito_admin_subject=source.get("COGNITO_ADMIN_SUBJECT") or None,
        cognito_admin_emails=[
            email.strip().lower()
            for email in source.get("COGNITO_ADMIN_EMAILS", "").split(",")
            if email.strip()
        ],
        snapshot_bucket=source["S3_SNAPSHOT_BUCKET"],
        ses_from_email=source["SES_FROM_EMAIL"],
        ses_to_email=source["SES_TO_EMAIL"],
    )


def _normalize_app_environment(value: str) -> AppEnvironment:
    if value in ("development", "test", "production"):
        return value  # type: ignore[return-value]
    raise EnvironmentConfigurationError(["APP_ENV"])


def is_production() -> bool:
    return os.environ.get("APP_ENV") == "production"


def site_url() -> str:
    return os.environ.get("SITE_URL", "http://localhost:8000").rstrip("/")
