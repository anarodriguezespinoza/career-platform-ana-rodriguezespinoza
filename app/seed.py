"""Seed local development data: `python -m app.seed`."""

from __future__ import annotations

from datetime import datetime

from app import models
from app.db import get_session_factory


def seed() -> None:
    published = models.PublicationState.PUBLISHED.value
    with get_session_factory()() as session:
        if session.get(models.Profile, "profile-ana") is None:
            session.add(models.Profile(
                id="profile-ana",
                name="Ana Rodriguez Espinoza",
                headline="Software Engineer",
                summary="Building reliable products and thoughtful user experiences.",
                email="ana@example.com",
                location="Remote",
                publication_state=published,
            ))
        if session.get(models.Experience, "experience-platform") is None:
            session.add(models.Experience(
                id="experience-platform",
                company="Career Platform",
                role="Software Engineer",
                description="Designed and delivered product experiences across the platform.",
                start_date=datetime(2024, 1, 1),
                display_order=0,
                publication_state=published,
            ))
        if session.get(models.Project, "project-career-platform") is None:
            session.add(models.Project(
                id="project-career-platform",
                slug="career-platform",
                name="Career Platform",
                description="A focused resume and portfolio platform.",
                display_order=0,
                publication_state=published,
                technologies=[
                    models.ProjectTechnology(technology="FastAPI", display_order=0),
                    models.ProjectTechnology(technology="Python", display_order=1),
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
