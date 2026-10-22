"""Version-controlled profile facts: education, links, and the profile shown while the database is down.

`app/content/profile.json` is read once and never touches the database, so the
home and about pages can still name the owner during an outage. A published
Profile row, when the database returns one, takes precedence for the editable
fields (name, headline, summary, email, location).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cache
from pathlib import Path

PROFILE_FILE = Path(__file__).parent / "content" / "profile.json"


@dataclass(frozen=True)
class Education:
    degree: str
    school: str
    dates: str
    location: str


@dataclass(frozen=True)
class ProfileLink:
    label: str
    url: str


@dataclass(frozen=True)
class ProfileFacts:
    name: str
    headline: str
    summary: str
    email: str
    location: str
    education: list[Education]
    links: list[ProfileLink]
    avatar_url: str | None = None


@cache
def load_profile_facts(path: Path = PROFILE_FILE) -> ProfileFacts:
    data = json.loads(path.read_text(encoding="utf-8"))
    return ProfileFacts(
        name=data["name"],
        headline=data["headline"],
        summary=data["summary"],
        email=data["email"],
        location=data["location"],
        education=[Education(**item) for item in data["education"]],
        links=[ProfileLink(**item) for item in data["links"]],
    )
