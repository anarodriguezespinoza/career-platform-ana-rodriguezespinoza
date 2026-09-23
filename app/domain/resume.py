"""Published resume projection and PDF rendering."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from xml.sax.saxutils import escape, quoteattr

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer
from sqlalchemy.orm import Session

from app.observability import error_type, logger
from app.repositories import ContentRepository


class ResumeUnavailableError(Exception):
    pass


@dataclass(frozen=True)
class ResumeExperience:
    company: str
    role: str
    description: str
    start_date: datetime
    end_date: datetime | None


@dataclass(frozen=True)
class ResumeProject:
    name: str
    description: str
    url: str | None
    repository_url: str | None
    technologies: list[str]


@dataclass(frozen=True)
class PublishedResumeData:
    name: str
    headline: str
    summary: str
    location: str
    title: str
    intro: str
    experience: list[ResumeExperience]
    projects: list[ResumeProject]
    skills: list[tuple[str, str]]  # (name, category)


def get_published_resume_data(session: Session) -> PublishedResumeData:
    try:
        content = ContentRepository(session).list_published()
    except Exception as error:
        logger.error("resume_projection_database_error", {"errorType": error_type(error)})
        raise ResumeUnavailableError("Published resume data is temporarily unavailable") from error

    profile, settings = content.profile, content.resume_settings
    if profile is None or settings is None:
        raise ResumeUnavailableError("Published resume data is unavailable")

    return PublishedResumeData(
        name=profile.name,
        headline=profile.headline,
        summary=profile.summary,
        location=profile.location,
        title=settings.title,
        intro=settings.intro,
        experience=[
            ResumeExperience(company=e.company, role=e.role, description=e.description, start_date=e.start_date, end_date=e.end_date)
            for e in content.experience
        ],
        projects=[
            ResumeProject(
                name=p.name, description=p.description, url=p.url, repository_url=p.repository_url,
                technologies=[t.technology for t in p.technologies],
            )
            for p in content.projects
        ],
        skills=[(s.name, s.category) for s in content.skills],
    )


_INK, _MUTED, _SUBTLE, _ACCENT, _WASH = (HexColor(c) for c in ("#172033", "#42506a", "#657089", "#3458d1", "#eef2ff"))
_BASE = ParagraphStyle("base", fontName="Helvetica", fontSize=10, leading=14.5, textColor=_INK)
_STYLES = {
    "title": ParagraphStyle("title", _BASE, fontName="Helvetica-Bold", fontSize=26, leading=30, spaceAfter=4),
    "headline": ParagraphStyle("headline", _BASE, fontSize=13, leading=17, textColor=_MUTED, spaceAfter=8),
    "location": ParagraphStyle("location", _BASE, fontSize=9, textColor=_SUBTLE, spaceAfter=18),
    "intro": ParagraphStyle("intro", _BASE, fontSize=11, leading=16, spaceAfter=18),
    "section": ParagraphStyle("section", _BASE, fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=_ACCENT, spaceBefore=14, spaceAfter=7),
    "item_title": ParagraphStyle("item_title", _BASE, fontName="Helvetica-Bold", fontSize=11, leading=15),
    "item_meta": ParagraphStyle("item_meta", _BASE, fontSize=9, textColor=_SUBTLE, spaceAfter=3),
    "skills": ParagraphStyle("skills", _BASE, leading=20),
}


def _text(value: str, style: str = "body") -> Paragraph:
    return Paragraph(escape(value).replace("\n", "<br/>"), _STYLES.get(style, _BASE))


def _link(url: str) -> Paragraph:
    return Paragraph(f'<a href={quoteattr(url)} color="#3458d1">{escape(url)}</a>', _BASE)


def generate_resume_pdf(data: PublishedResumeData) -> bytes:
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer, pagesize=A4, leftMargin=42, rightMargin=42, topMargin=42, bottomMargin=42,
        title=data.title, author=data.name, subject="Published resume",
    )
    story: list = [
        _text(data.name, "title"),
        _text(data.headline, "headline"),
        _text(data.location, "location"),
        _text(data.intro, "intro"),
        _text(data.summary),
    ]

    if data.experience:
        story.append(_text("EXPERIENCE", "section"))
        for item in data.experience:
            end = str(item.end_date.year) if item.end_date else "Present"
            story.append(KeepTogether([
                _text(f"{item.role} · {item.company}", "item_title"),
                _text(f"{item.start_date.year} – {end}", "item_meta"),
                _text(item.description),
                Spacer(0, 10),
            ]))

    if data.projects:
        story.append(_text("PROJECTS", "section"))
        for project in data.projects:
            block: list = [_text(project.name, "item_title"), _text(project.description)]
            if project.technologies:
                block.append(_text(" · ".join(project.technologies)))
            block.extend(_link(url) for url in (project.url, project.repository_url) if url)
            block.append(Spacer(0, 10))
            story.append(KeepTogether(block))

    if data.skills:
        story.append(_text("SKILLS", "section"))
        chips = "&nbsp;&nbsp;".join(
            f'<font backColor="#eef2ff">&nbsp;{escape(name)} · {escape(category)}&nbsp;</font>' for name, category in data.skills
        )
        story.append(Paragraph(chips, _STYLES["skills"]))

    document.build(story)
    return buffer.getvalue()
