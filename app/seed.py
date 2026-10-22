"""Seed the owner's real content: `python -m app.seed`.

Every row is real (taken from the resume page and `app/content/profile.json`), so
running this against the production database never publishes invented
experience. Rows are only added when their id is missing, so re-running is safe
and never overwrites edits made directly in the database.
"""

from __future__ import annotations

from datetime import datetime

from app import models
from app.db import get_session_factory
from app.profile_facts import load_profile_facts

EXPERIENCE = [
    ("experience-hatch", "Hatch Baby Inc", "iOS Engineering Intern", datetime(2026, 6, 1), None,
     "Ships user-facing features in Swift for the Hatch Sleep iOS app on a weekly release cadence, and builds schema-driven analytics instrumentation."),
    ("experience-ey", "Ernst & Young LLP", "Transaction Diligence & Business Valuation Intern", datetime(2025, 6, 1), datetime(2025, 8, 31),
     "Analyzed five years of financial statements across M&A engagements and performed proof-of-cash reconciliations."),
    ("experience-romo-cabrini", "Romo & Cabrini Justice Center", "Program Coordinator", datetime(2024, 1, 1), datetime(2026, 5, 31),
     "Managed 10+ events per semester and co-designed accessible programming for first-generation immigrant students."),
]


def seed() -> None:
    published = models.PublicationState.PUBLISHED.value
    facts = load_profile_facts()
    with get_session_factory()() as session:
        if session.get(models.Profile, "profile-ana") is None:
            session.add(models.Profile(
                id="profile-ana",
                name=facts.name,
                headline=facts.headline,
                summary=facts.summary,
                email=facts.email,
                location=facts.location,
                publication_state=published,
            ))
        for order, (experience_id, company, role, start, end, description) in enumerate(EXPERIENCE):
            if session.get(models.Experience, experience_id) is None:
                session.add(models.Experience(
                    id=experience_id,
                    company=company,
                    role=role,
                    description=description,
                    start_date=start,
                    end_date=end,
                    display_order=order,
                    publication_state=published,
                ))
        if session.get(models.Project, "project-this-website") is None:
            session.add(models.Project(
                id="project-this-website",
                slug="this-website",
                name="This website (in progress)",
                description="This portfolio: a FastAPI and PostgreSQL app on Railway, migrated from an Azure VM running SQLite behind Nginx. Still in progress.",
                url="https://anarodriguezespinoza.com",
                repository_url="https://github.com/anarodriguezespinoza/career-platform-ana-rodriguezespinoza",
                display_order=0,
                publication_state=published,
                technologies=[
                    models.ProjectTechnology(technology="FastAPI", display_order=0),
                    models.ProjectTechnology(technology="PostgreSQL", display_order=1),
                    models.ProjectTechnology(technology="Railway", display_order=2),
                ],
            ))
        if session.get(models.Skill, "skill-python") is None:
            session.add(models.Skill(id="skill-python", name="Python", category="Languages", display_order=0, publication_state=published))
        resume = session.get(models.ResumeSettings, "resume-settings-default")
        if resume is None:
            session.add(models.ResumeSettings(
                id="resume-settings-default",
                title="Ana Rodriguez Espinoza Resume",
                intro="Resume and professional experience.",
                publication_state=published,
            ))
        else:
            resume.publication_state = published
        session.commit()


if __name__ == "__main__":
    seed()
