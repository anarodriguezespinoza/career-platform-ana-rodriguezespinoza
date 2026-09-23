"""Owner sign-in and sign-out."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.auth import SESSION_COOKIE, AuthenticationError, AuthorizationError, SignInError, cognito_sign_in, require_admin_token
from app.observability import error_type, logger
from app.routes.api import set_session_cookie
from app.routes.security import verify_same_origin
from app.templating import render

router = APIRouter()
SIGN_IN_FAILED = "Sign-in failed. Check your credentials and try again."


def safe_return_to(value: str | None) -> str:
    """Only allow redirects back into the admin area."""
    if value and (value == "/admin" or value.startswith("/admin/")) and "//" not in value and "\\" not in value:
        return value
    return "/admin"


@router.get("/sign-in", response_class=HTMLResponse)
def sign_in_page(request: Request, returnTo: str | None = None) -> HTMLResponse:  # noqa: N803
    return render(request, "sign_in.html", {"return_to": safe_return_to(returnTo)})


@router.post("/sign-in", response_class=HTMLResponse, response_model=None, dependencies=[Depends(verify_same_origin)])
def sign_in(
    request: Request,
    email: Annotated[str, Form()],
    password: Annotated[str, Form()],
    returnTo: Annotated[str, Form()] = "/admin",  # noqa: N803
) -> HTMLResponse | RedirectResponse:
    return_to = safe_return_to(returnTo)
    try:
        token = cognito_sign_in(email, password)
        require_admin_token(token)
    except (SignInError, AuthenticationError, AuthorizationError) as error:
        logger.warn("admin_sign_in_failed", {"errorType": error_type(error.__cause__ or error)})
        return render(request, "sign_in.html", {"return_to": return_to, "error": SIGN_IN_FAILED, "email": email}, status_code=401)
    response = RedirectResponse(return_to, status_code=303)
    set_session_cookie(response, token)
    return response


@router.post("/sign-out", dependencies=[Depends(verify_same_origin)])
def sign_out() -> RedirectResponse:
    response = RedirectResponse("/sign-in", status_code=303)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response
