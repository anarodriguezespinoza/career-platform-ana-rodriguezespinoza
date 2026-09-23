"""Cognito authentication and the owner-only admin boundary."""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import jwt
from starlette.requests import Request

from app.config import AppEnv, load_env

SESSION_COOKIE = "cognito-access-token"
_BEARER = re.compile(r"^Bearer\s+(\S+)$", re.IGNORECASE)


class AuthenticationError(Exception):
    status_code = 401

    def __init__(self) -> None:
        super().__init__("Unauthorized")


class AuthorizationError(Exception):
    status_code = 403

    def __init__(self) -> None:
        super().__init__("Forbidden")


class SignInError(Exception):
    pass


@dataclass(frozen=True)
class AdminIdentity:
    subject: str
    email: str


@lru_cache(maxsize=8)
def _jwks_client(issuer: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{issuer}/.well-known/jwks.json", cache_keys=True)


def verify_cognito_id_token(token: str, env: AppEnv | None = None) -> AdminIdentity:
    env = env or load_env()
    issuer = env.cognito_issuer.rstrip("/")
    try:
        signing_key = _jwks_client(issuer).get_signing_key_from_jwt(token)
        payload: dict[str, Any] = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=env.cognito_client_id,
            issuer=issuer,
        )
    except Exception as error:
        raise AuthenticationError() from error

    subject, email = payload.get("sub"), payload.get("email")
    if payload.get("token_use") != "id" or not isinstance(subject, str) or not isinstance(email, str) or not email:
        raise AuthenticationError()
    return AdminIdentity(subject=subject, email=email)


def extract_token(request: Request) -> str | None:
    match = _BEARER.match(request.headers.get("authorization", ""))
    if match:
        return match.group(1)
    return request.cookies.get(SESSION_COOKIE) or None


def authorize_identity(identity: AdminIdentity, env: AppEnv) -> AdminIdentity:
    allowed_subjects = [env.cognito_admin_subject] if env.cognito_admin_subject else []
    allowed_emails = env.cognito_admin_emails
    if not allowed_subjects and not allowed_emails:
        raise AuthorizationError()
    if identity.subject not in allowed_subjects and identity.email.lower() not in allowed_emails:
        raise AuthorizationError()
    return identity


def require_admin_token(token: str | None) -> AdminIdentity:
    if not token:
        raise AuthenticationError()
    try:
        env = load_env()
    except Exception as error:
        raise AuthenticationError() from error
    return authorize_identity(verify_cognito_id_token(token, env), env)


def require_admin(request: Request) -> AdminIdentity:
    """Verify the request's Cognito ID token and check it against the owner allowlist."""
    return require_admin_token(extract_token(request))


def cognito_sign_in(email: str, password: str, env: AppEnv | None = None) -> str:
    """Authenticate with Cognito's SRP flow and return the ID token."""
    env = env or load_env()
    user_pool_id = env.cognito_issuer.rstrip("/").rsplit("/", 1)[-1]
    region = user_pool_id.split("_", 1)[0]
    try:
        import boto3
        from pycognito.aws_srp import AWSSRP

        srp = AWSSRP(
            username=email,
            password=password,
            pool_id=user_pool_id,
            client_id=env.cognito_client_id,
            client=boto3.client("cognito-idp", region_name=region),
        )
        tokens = srp.authenticate_user()
        return str(tokens["AuthenticationResult"]["IdToken"])
    except Exception as error:
        raise SignInError("Sign-in failed") from error
