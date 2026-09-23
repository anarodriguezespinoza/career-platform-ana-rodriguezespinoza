"""Request guards shared by admin routes."""

from __future__ import annotations

from urllib.parse import urlsplit

from fastapi import Request

from app.auth import AdminIdentity, AuthenticationError, AuthorizationError, require_admin
from app.routes.errors import AdminSignInRequiredError, CrossOriginRequestError


def verify_same_origin(request: Request) -> None:
    """Reject cross-site form posts (defense in depth alongside SameSite=Lax cookies)."""
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
    origin = request.headers.get("origin") or request.headers.get("referer")
    if origin is None:
        return
    if urlsplit(origin).netloc != request.headers.get("host"):
        raise CrossOriginRequestError()


def admin_identity(request: Request) -> AdminIdentity:
    try:
        return require_admin(request)
    except (AuthenticationError, AuthorizationError) as error:
        path = request.url.path if request.method == "GET" else "/admin"
        raise AdminSignInRequiredError(path) from error
