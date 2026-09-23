"""JSON and file endpoints: contact submission, health, resume PDF, and session exchange."""

from __future__ import annotations

import asyncio
import json
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import SESSION_COOKIE, AuthenticationError, AuthorizationError, extract_token, require_admin
from app.config import is_production
from app.db import get_db, get_session_factory
from app.domain.inquiries import ContactInputError, RateLimitError, submit_inquiry, validate_contact_input
from app.domain.resume import generate_resume_pdf, get_published_resume_data
from app.domain.snapshot import get_runtime_snapshot_store
from app.observability import error_type, get_request_context, logger
from app.routes.public import CONTACT_FAILED, CONTACT_INVALID, CONTACT_RATE_LIMITED, CONTACT_SUCCESS, client_identity

router = APIRouter(prefix="/api")
DB = Annotated[Session, Depends(get_db)]

DATABASE_TIMEOUT_SECONDS = 1.5


def _json(body: dict, status_code: int, request_id: str, headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse(body, status_code=status_code, headers={**(headers or {}), "x-request-id": request_id})


@router.post("/contact")
async def contact(request: Request) -> JSONResponse:
    request_id = get_request_context(request).request_id
    try:
        body = json.loads(await request.body())
    except ValueError:
        return _json({"message": CONTACT_INVALID}, 400, request_id)

    def submit() -> None:
        session = get_session_factory()()
        try:
            submit_inquiry(session, validate_contact_input(body), client_identity(request), request_id=request_id)
        finally:
            session.close()

    try:
        await run_in_threadpool(submit)
    except RateLimitError as error:
        return _json({"message": CONTACT_RATE_LIMITED}, 429, request_id, {"Retry-After": str(error.retry_after_seconds)})
    except ContactInputError:
        return _json({"message": CONTACT_INVALID}, 400, request_id)
    except Exception as error:
        logger.error("contact_submission_failed", {"requestId": request_id, "errorType": error_type(error)})
        return _json({"message": CONTACT_FAILED}, 500, request_id)
    return _json({"message": CONTACT_SUCCESS}, 201, request_id)


def _select_one() -> None:
    session = get_session_factory()()
    try:
        session.execute(text("SELECT 1"))
    finally:
        session.close()


async def probe_database(request_id: str) -> Literal["up", "down"]:
    try:
        await asyncio.wait_for(run_in_threadpool(_select_one), timeout=DATABASE_TIMEOUT_SECONDS)
        return "up"
    except Exception as error:
        logger.warn("health_database_unavailable", {"requestId": request_id, "errorType": error_type(error)})
        return "down"


async def probe_snapshot(request_id: str) -> bool:
    try:
        return await run_in_threadpool(lambda: get_runtime_snapshot_store().read() is not None)
    except Exception as error:
        logger.warn("health_snapshot_unavailable", {"requestId": request_id, "errorType": error_type(error)})
        return False


@router.get("/health")
async def health(request: Request) -> JSONResponse:
    request_id = get_request_context(request).request_id
    headers = {"Cache-Control": "no-store"}
    database = await probe_database(request_id)
    if database == "up":
        return _json({"status": "ok", "database": database, "publicSource": "database"}, 200, request_id, headers)
    if await probe_snapshot(request_id):
        return _json({"status": "degraded", "database": database, "publicSource": "snapshot"}, 200, request_id, headers)
    return _json({"status": "unavailable", "database": database, "publicSource": "none"}, 503, request_id, headers)


@router.get("/resume")
def resume(request: Request, db: DB) -> Response:
    request_id = get_request_context(request).request_id
    try:
        pdf = generate_resume_pdf(get_published_resume_data(db))
    except Exception as error:
        logger.error("resume_pdf_generation_error", {"requestId": request_id, "errorType": error_type(error)})
        return PlainTextResponse("The published resume is temporarily unavailable", status_code=503, headers={"x-request-id": request_id})
    return Response(
        pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="resume.pdf"',
            "Cache-Control": "public, max-age=300",
            "x-request-id": request_id,
        },
    )


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(SESSION_COOKIE, token, httponly=True, path="/", samesite="lax", secure=is_production())


@router.get("/auth/session")
def session(request: Request) -> Response:
    """Exchange a Cognito ID token (Authorization: Bearer) for the admin session cookie."""
    try:
        user = require_admin(request)
    except AuthorizationError:
        return PlainTextResponse("Forbidden", status_code=403)
    except AuthenticationError:
        return PlainTextResponse("Unauthorized", status_code=401)
    response = JSONResponse({"authenticated": True, "user": {"subject": user.subject, "email": user.email}})
    set_session_cookie(response, extract_token(request) or "")
    return response
