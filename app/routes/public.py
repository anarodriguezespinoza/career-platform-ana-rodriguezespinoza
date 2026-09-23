"""Public portfolio pages, contact form, robots.txt, and sitemap.xml."""

from __future__ import annotations

from typing import Annotated
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse, Response
from sqlalchemy.orm import Session

from app.config import site_url
from app.db import get_db
from app.domain.inquiries import (
    OPPORTUNITY_TYPES,
    ContactInputError,
    RateLimitError,
    submit_inquiry,
    validate_contact_input,
)
from app.domain.snapshot import PublicContentUnavailableError
from app.observability import error_type, get_request_context, logger
from app.public_content import find_public_project, get_public_content
from app.routes.errors import NotFoundError
from app.templating import page_meta, render

router = APIRouter()
DB = Annotated[Session, Depends(get_db)]

CONTACT_SUCCESS = "Thanks. Your message has been received."
CONTACT_INVALID = "Please check your details and try again."
CONTACT_RATE_LIMITED = "Please wait before sending another message."
CONTACT_FAILED = "We could not receive your message. Please try again."


def client_identity(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return forwarded or request.headers.get("x-real-ip", "").strip() or (request.client.host if request.client else "") or "anonymous"


@router.get("/", response_class=HTMLResponse)
def home(request: Request, db: DB) -> HTMLResponse:
    content, source = get_public_content(db)
    meta = page_meta("Ana Rodriguez — Software engineer", "The professional portfolio of Ana Rodriguez, a product-minded software engineer.", "/")
    return render(request, "public/home.html", {"meta": meta, "content": content, "source": source})


@router.get("/about", response_class=HTMLResponse)
def about(request: Request, db: DB) -> HTMLResponse:
    content, source = get_public_content(db)
    meta = page_meta("About — Ana Rodriguez", "Professional summary and contact details for Ana Rodriguez.", "/about")
    return render(request, "public/about.html", {"meta": meta, "content": content, "source": source})


@router.get("/experience", response_class=HTMLResponse)
def experience(request: Request, db: DB) -> HTMLResponse:
    content, source = get_public_content(db)
    meta = page_meta("Experience — Ana Rodriguez", "Professional experience and career history for Ana Rodriguez.", "/experience")
    return render(request, "public/experience.html", {"meta": meta, "content": content, "source": source})


@router.get("/projects", response_class=HTMLResponse)
def projects(request: Request, db: DB) -> HTMLResponse:
    content, source = get_public_content(db)
    meta = page_meta("Projects — Ana Rodriguez", "Selected projects and experiments by Ana Rodriguez.", "/projects")
    return render(request, "public/projects.html", {"meta": meta, "content": content, "source": source})


@router.get("/projects/{slug}", response_class=HTMLResponse)
def project_detail(slug: str, request: Request, db: DB) -> HTMLResponse:
    content, source = get_public_content(db)
    project = find_public_project(slug, content)
    if project is None:
        raise NotFoundError()
    meta = page_meta(f"{project.name} — Ana Rodriguez", project.description, f"/projects/{slug}")
    return render(request, "public/project_detail.html", {"meta": meta, "project": project, "source": source})


@router.get("/skills", response_class=HTMLResponse)
def skills(request: Request, db: DB) -> HTMLResponse:
    content, source = get_public_content(db)
    groups: dict[str, list] = {}
    for skill in content.skills:
        groups.setdefault(skill.category, []).append(skill)
    meta = page_meta("Skills — Ana Rodriguez", "Tools, technologies, and capabilities used by Ana Rodriguez.", "/skills")
    return render(request, "public/skills.html", {"meta": meta, "groups": groups, "source": source})


@router.get("/resume", response_class=HTMLResponse)
def resume(request: Request, db: DB) -> HTMLResponse:
    content, source = get_public_content(db)
    settings = content.resume_settings
    if source == "database" and content.profile and settings:
        download_url: str | None = "/api/resume"
    else:
        download_url = settings.resume_url if settings else None
    meta = page_meta("Resume — Ana Rodriguez", "Resume and professional profile for Ana Rodriguez.", "/resume")
    return render(request, "public/resume.html", {"meta": meta, "content": content, "source": source, "download_url": download_url})


def _contact_page(request: Request, status: str | None = None, message: str | None = None, values: dict[str, str] | None = None, status_code: int = 200) -> HTMLResponse:
    meta = page_meta("Contact — Ana Rodriguez", "Send Ana Rodriguez a professional inquiry.", "/contact")
    return render(
        request,
        "public/contact.html",
        {"meta": meta, "opportunity_types": OPPORTUNITY_TYPES, "status": status, "message": message, "values": values or {}},
        status_code=status_code,
    )


@router.get("/contact", response_class=HTMLResponse)
def contact(request: Request, sent: bool = False) -> HTMLResponse:
    return _contact_page(request, "success", CONTACT_SUCCESS) if sent else _contact_page(request)


@router.post("/contact", response_class=HTMLResponse, response_model=None)
def contact_submit(
    request: Request,
    db: DB,
    name: Annotated[str, Form()] = "",
    email: Annotated[str, Form()] = "",
    opportunityType: Annotated[str, Form()] = "",  # noqa: N803 - matches the JSON API field name
    message: Annotated[str, Form()] = "",
) -> HTMLResponse | RedirectResponse:
    values = {"name": name, "email": email, "opportunityType": opportunityType, "message": message}
    request_id = get_request_context(request).request_id
    try:
        submit_inquiry(db, validate_contact_input(values), client_identity(request), request_id=request_id)
    except ContactInputError:
        return _contact_page(request, "error", CONTACT_INVALID, values, 400)
    except RateLimitError as error:
        response = _contact_page(request, "error", CONTACT_RATE_LIMITED, values, 429)
        response.headers["Retry-After"] = str(error.retry_after_seconds)
        return response
    except Exception as error:
        logger.error("contact_submission_failed", {"requestId": request_id, "errorType": error_type(error)})
        return _contact_page(request, "error", CONTACT_FAILED, values, 500)
    return RedirectResponse("/contact?sent=1", status_code=303)


@router.get("/robots.txt", response_class=PlainTextResponse)
def robots() -> str:
    return f"User-Agent: *\nAllow: /\nDisallow: /admin\nDisallow: /sign-in\nDisallow: /api/\n\nSitemap: {site_url()}/sitemap.xml\n"


def build_public_sitemap(origin: str, slugs: list[str]) -> str:
    routes = [
        ("/", "monthly", 1),
        ("/about", "monthly", 0.8),
        ("/experience", "monthly", 0.8),
        ("/projects", "monthly", 0.9),
        *((f"/projects/{slug}", "monthly", 0.7) for slug in slugs),
        ("/skills", "monthly", 0.8),
        ("/resume", "monthly", 0.8),
        ("/contact", "monthly", 0.7),
    ]
    entries = "".join(
        f"<url><loc>{escape(origin + path)}</loc><changefreq>{frequency}</changefreq><priority>{priority}</priority></url>\n"
        for path, frequency, priority in routes
    )
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{entries}</urlset>\n'


@router.get("/sitemap.xml")
def sitemap(db: DB) -> Response:
    try:
        content, _ = get_public_content(db)
        slugs = [project.slug for project in content.projects]
    except PublicContentUnavailableError:
        slugs = []
    return Response(build_public_sitemap(site_url(), slugs), media_type="application/xml")
