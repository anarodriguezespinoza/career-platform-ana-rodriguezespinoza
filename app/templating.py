"""Jinja2 environment, filters, and page metadata helpers."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi.templating import Jinja2Templates
from starlette.requests import Request
from starlette.responses import HTMLResponse

from app.config import site_url

templates = Jinja2Templates(directory=Path(__file__).parent / "templates")

SITE_NAME = "Ana Rodriguez"
DEFAULT_TITLE = "Ana Rodriguez — Software engineer"
DEFAULT_DESCRIPTION = "The professional portfolio of Ana Rodriguez, a product-minded software engineer."


@dataclass(frozen=True)
class PageMeta:
    title: str
    description: str
    canonical_url: str | None = None
    site_name: str = SITE_NAME


def page_meta(title: str, description: str, path: str, base_url: str | None = None) -> PageMeta:
    return PageMeta(title=title, description=description, canonical_url=f"{base_url or site_url()}{path}")


def _month_year(value: datetime) -> str:
    return value.strftime("%b %Y")


def _datetime(value: datetime) -> str:
    return value.strftime("%Y-%m-%d %H:%M UTC")


def _two_digit(value: int) -> str:
    return f"{value:02d}"


templates.env.filters["month_year"] = _month_year
templates.env.filters["datetime"] = _datetime
templates.env.filters["two_digit"] = _two_digit
templates.env.globals["current_year"] = lambda: datetime.now(UTC).year
templates.env.globals["DEFAULT_META"] = PageMeta(title=DEFAULT_TITLE, description=DEFAULT_DESCRIPTION)


def render(request: Request, name: str, context: dict[str, Any] | None = None, status_code: int = 200) -> HTMLResponse:
    return templates.TemplateResponse(request, name, context or {}, status_code=status_code)
