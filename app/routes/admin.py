"""Owner-only admin: content drafts, preview, publishing, inquiries, and resume."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from sqlalchemy.orm import Session
from starlette.datastructures import FormData

from app.auth import AdminIdentity
from app.db import get_db
from app.domain.admin import DRAFT_FIELDS, AdminContentService, AdminOperationError
from app.domain.content import CONTENT_TYPES, ContentType, EditableContent
from app.domain.resume import generate_resume_pdf, get_published_resume_data
from app.domain.snapshot import get_runtime_snapshot_store
from app.models import InquiryStatus
from app.observability import create_request_context, error_type, logger
from app.repositories import ContentRepository, InquiryRepository, RecordNotFoundError
from app.routes.errors import NotFoundError
from app.routes.security import admin_identity, verify_same_origin
from app.templating import render

router = APIRouter(prefix="/admin", dependencies=[Depends(verify_same_origin)])
DB = Annotated[Session, Depends(get_db)]
Admin = Annotated[AdminIdentity, Depends(admin_identity)]


async def read_form(request: Request) -> FormData:
    return await request.form()


Form = Annotated[FormData, Depends(read_form)]

STATUS_MESSAGES = {
    "saved": "Draft saved",
    "published": "Published",
    "unpublished": "Unpublished",
    "archived": "Archived",
}
STATE_CHANGE_STATUS = {"unpublish": "unpublished", "archive": "archived"}


def _status_message(status: str | None) -> str | None:
    return STATUS_MESSAGES.get(status or "")


def _content_service(db: Session, with_snapshot: bool = False) -> AdminContentService:
    return AdminContentService(ContentRepository(db), get_runtime_snapshot_store() if with_snapshot else None)


def _records(content: EditableContent, content_type: ContentType) -> list[Any]:
    records: dict[str, list[Any]] = {
        "profile": [content.profile] if content.profile else [],
        "experience": content.experience,
        "project": content.projects,
        "skill": content.skills,
        "resumeSettings": [content.resume_settings] if content.resume_settings else [],
    }
    return records[content_type]


def _form_values(record: Any, content_type: ContentType) -> dict[str, Any]:
    values: dict[str, Any] = {}
    for form_name, attribute, kind, _ in DRAFT_FIELDS[content_type]:
        value = getattr(record, attribute)
        if kind == "date":
            value = value.date().isoformat() if value else ""
        elif kind == "list":
            value = ", ".join(t.technology for t in value)
        elif kind == "bool":
            value = bool(value)
        values[form_name] = "" if value is None else value
    return values


def _operation_failure_message(error: Exception, fallback: str) -> str:
    if isinstance(error, AdminOperationError) and error.code == "INVALID_CONTENT":
        return f"{fallback}: {error}"
    return fallback


@router.get("", response_class=HTMLResponse)
def dashboard(request: Request, actor: Admin, status: str | None = None) -> HTMLResponse:
    return render(request, "admin/dashboard.html", {"actor": actor, "message": _status_message(status)})


@router.post("/publish", response_model=None)
def publish(request: Request, actor: Admin, db: DB) -> Response:
    request_id = create_request_context().request_id
    try:
        _content_service(db, with_snapshot=True).publish_content(actor, request_id)
    except Exception as error:
        logger.error("admin_publish_failed", {"requestId": request_id, "errorType": error_type(error)})
        message = _operation_failure_message(error, "Unable to publish")
        return render(request, "admin/dashboard.html", {"actor": actor, "message": message, "error": True}, status_code=400 if isinstance(error, AdminOperationError) and error.code == "INVALID_CONTENT" else 503)
    return RedirectResponse("/admin?status=published", status_code=303)


@router.get("/content", response_class=HTMLResponse)
def content_list(request: Request, actor: Admin, db: DB) -> HTMLResponse:
    content = _content_service(db).preview_draft(actor)
    groups = [(content_type, _records(content, content_type)) for content_type in CONTENT_TYPES]
    return render(request, "admin/content_list.html", {"actor": actor, "groups": groups})


def _find_record(db: Session, actor: AdminIdentity, content_type: str, record_id: str) -> tuple[ContentType, Any]:
    if content_type not in CONTENT_TYPES:
        raise NotFoundError()
    typed: ContentType = content_type  # type: ignore[assignment]
    content = _content_service(db).preview_draft(actor)
    record = next((r for r in _records(content, typed) if r.id == record_id), None)
    if record is None:
        raise NotFoundError()
    return typed, record


def _edit_page(request: Request, actor: AdminIdentity, content_type: ContentType, record: Any, values: dict[str, Any], message: str | None, error: bool = False, status_code: int = 200) -> HTMLResponse:
    return render(
        request,
        "admin/content_edit.html",
        {
            "actor": actor,
            "content_type": content_type,
            "record": record,
            "fields": DRAFT_FIELDS[content_type],
            "values": values,
            "message": message,
            "error": error,
        },
        status_code=status_code,
    )


@router.get("/content/{content_type}/{record_id}", response_class=HTMLResponse)
def content_edit(content_type: str, record_id: str, request: Request, actor: Admin, db: DB, status: str | None = None) -> HTMLResponse:
    typed, record = _find_record(db, actor, content_type, record_id)
    return _edit_page(request, actor, typed, record, _form_values(record, typed), _status_message(status))


@router.post("/content/{content_type}/{record_id}", response_model=None)
def content_save(content_type: str, record_id: str, request: Request, actor: Admin, db: DB, form: Form) -> Response:
    typed, record = _find_record(db, actor, content_type, record_id)
    data: dict[str, Any] = {name: form.get(name) for name, *_ in DRAFT_FIELDS[typed]}
    request_id = create_request_context().request_id
    try:
        _content_service(db).save_draft(typed, record_id, data, actor, request_id)
    except AdminOperationError as error:
        values = {**data, **{name: data.get(name) == "on" for name, _, kind, _ in DRAFT_FIELDS[typed] if kind == "bool"}}
        message = _operation_failure_message(error, "Unable to save draft")
        return _edit_page(request, actor, typed, record, values, message, error=True, status_code=400 if error.code == "INVALID_CONTENT" else 503)
    return RedirectResponse(f"/admin/content/{typed}/{record_id}?status=saved", status_code=303)


def _change_state(request: Request, actor: AdminIdentity, db: Session, content_type: str, record_id: str, operation: str) -> Response:
    typed, record = _find_record(db, actor, content_type, record_id)
    request_id = create_request_context().request_id
    try:
        service = _content_service(db, with_snapshot=True)
        if operation == "unpublish":
            service.unpublish_record(typed, record_id, actor, request_id)
        else:
            service.archive_record(typed, record_id, actor, request_id)
    except Exception as error:
        logger.error("admin_state_change_failed", {"operation": operation, "requestId": request_id, "errorType": error_type(error)})
        message = _operation_failure_message(error, f"Unable to {operation}")
        return _edit_page(request, actor, typed, record, _form_values(record, typed), message, error=True, status_code=503)
    return RedirectResponse(f"/admin/content/{typed}/{record_id}?status={STATE_CHANGE_STATUS[operation]}", status_code=303)


@router.post("/content/{content_type}/{record_id}/unpublish", response_model=None)
def content_unpublish(content_type: str, record_id: str, request: Request, actor: Admin, db: DB) -> Response:
    return _change_state(request, actor, db, content_type, record_id, "unpublish")


@router.post("/content/{content_type}/{record_id}/archive", response_model=None)
def content_archive(content_type: str, record_id: str, request: Request, actor: Admin, db: DB) -> Response:
    return _change_state(request, actor, db, content_type, record_id, "archive")


@router.get("/preview", response_class=HTMLResponse)
def preview(request: Request, actor: Admin, db: DB) -> HTMLResponse:
    request_id = create_request_context().request_id
    logger.info("admin_server_action", {"operation": "preview_draft", "requestId": request_id})
    content = _content_service(db).preview_draft(actor, request_id)
    return render(request, "admin/preview.html", {"actor": actor, "content": content})


@router.get("/inquiries", response_class=HTMLResponse)
def inquiries(request: Request, actor: Admin, db: DB) -> HTMLResponse:
    return render(request, "admin/inquiries.html", {"actor": actor, "inquiries": InquiryRepository(db).list()})


@router.get("/inquiries/{inquiry_id}", response_class=HTMLResponse)
def inquiry_detail(inquiry_id: str, request: Request, actor: Admin, db: DB) -> HTMLResponse:
    inquiry = InquiryRepository(db).find_by_id(inquiry_id)
    if inquiry is None:
        raise NotFoundError()
    return render(request, "admin/inquiry_detail.html", {"actor": actor, "inquiry": inquiry, "statuses": list(InquiryStatus)})


def _log_inquiry_action(operation: str, inquiry_id: str, actor: AdminIdentity) -> None:
    request_id = create_request_context().request_id
    logger.info("admin_server_action", {"operation": operation, "inquiryId": inquiry_id, "actorSubject": actor.subject, "requestId": request_id})


@router.post("/inquiries/{inquiry_id}/status")
def inquiry_status(inquiry_id: str, actor: Admin, db: DB, form: Form) -> RedirectResponse:
    _log_inquiry_action("update_inquiry_status", inquiry_id, actor)
    try:
        status = InquiryStatus(str(form.get("status", "")))
    except ValueError as error:
        raise NotFoundError() from error
    try:
        InquiryRepository(db).update_status(inquiry_id, status)
    except RecordNotFoundError as error:
        raise NotFoundError() from error
    return RedirectResponse(f"/admin/inquiries/{inquiry_id}", status_code=303)


@router.post("/inquiries/{inquiry_id}/notes")
def inquiry_notes(inquiry_id: str, actor: Admin, db: DB, form: Form) -> RedirectResponse:
    _log_inquiry_action("update_inquiry_notes", inquiry_id, actor)
    try:
        InquiryRepository(db).update_notes(inquiry_id, str(form.get("privateNotes", "")))
    except RecordNotFoundError as error:
        raise NotFoundError() from error
    return RedirectResponse(f"/admin/inquiries/{inquiry_id}", status_code=303)


@router.post("/inquiries/{inquiry_id}/delete")
def inquiry_delete(inquiry_id: str, actor: Admin, db: DB) -> RedirectResponse:
    _log_inquiry_action("delete_inquiry", inquiry_id, actor)
    try:
        InquiryRepository(db).delete(inquiry_id)
    except RecordNotFoundError as error:
        raise NotFoundError() from error
    return RedirectResponse("/admin/inquiries", status_code=303)


@router.get("/resume", response_class=HTMLResponse)
def resume_page(request: Request, actor: Admin) -> HTMLResponse:
    return render(request, "admin/resume.html", {"actor": actor})


@router.post("/resume", response_model=None)
def resume_generate(request: Request, actor: Admin, db: DB) -> Response:
    request_id = create_request_context().request_id
    logger.info("admin_server_action", {"operation": "generate_published_resume", "actorSubject": actor.subject, "requestId": request_id})
    try:
        pdf = generate_resume_pdf(get_published_resume_data(db))
    except Exception as error:
        logger.error("resume_pdf_generation_error", {"requestId": request_id, "errorType": error_type(error)})
        return render(request, "admin/resume.html", {"actor": actor, "message": "The published resume is temporarily unavailable", "error": True}, status_code=503)
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="resume.pdf"', "Cache-Control": "no-store"})
