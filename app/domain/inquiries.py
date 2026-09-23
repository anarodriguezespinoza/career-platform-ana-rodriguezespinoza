"""Contact inquiries: validation, rate limiting, submission, and notification."""

from __future__ import annotations

import math
import re
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy.orm import Session

from app.config import load_env
from app.models import NotificationStatus
from app.observability import error_type, logger
from app.repositories import CreateInquiryInput, InquiryRepository

OPPORTUNITY_TYPES: list[tuple[str, str]] = [
    ("PROJECT", "A project"),
    ("COLLABORATION", "A collaboration"),
    ("SPEAKING", "Speaking"),
    ("OTHER", "Something else"),
]
_OPPORTUNITY_VALUES = {value for value, _ in OPPORTUNITY_TYPES}
_EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class ContactInputError(ValueError):
    status_code = 400

    def __init__(self, message: str = "Invalid contact input") -> None:
        super().__init__(message)


@dataclass(frozen=True)
class ContactInput:
    name: str
    email: str
    message: str
    opportunity_type: str


def validate_contact_input(data: Any) -> ContactInput:
    if not isinstance(data, dict):
        raise ContactInputError()
    raw_name, raw_email, raw_message = data.get("name"), data.get("email"), data.get("message")
    name = " ".join(raw_name.split()) if isinstance(raw_name, str) else ""
    email = raw_email.strip().lower() if isinstance(raw_email, str) else ""
    message = raw_message.strip() if isinstance(raw_message, str) else ""
    opportunity_type = data.get("opportunityType")

    if not 2 <= len(name) <= 120:
        raise ContactInputError()
    if not _EMAIL.match(email) or len(email) > 254:
        raise ContactInputError()
    if not 1 <= len(message) <= 5000:
        raise ContactInputError()
    if opportunity_type not in _OPPORTUNITY_VALUES:
        raise ContactInputError()
    return ContactInput(name=name, email=email, message=message, opportunity_type=opportunity_type)


class RateLimitError(Exception):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Too many contact submissions")
        self.retry_after_seconds = retry_after_seconds


class BoundedRateLimiter:
    """In-process fixed-window limiter (per application instance)."""

    def __init__(self, max_attempts: int = 3, window_seconds: float = 60 * 60, max_entries: int = 10_000) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.max_entries = max_entries
        self._entries: dict[str, list[float]] = {}  # key -> [count, reset_at]
        self._lock = threading.Lock()

    def consume(self, key: str, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        with self._lock:
            current = self._entries.get(key)
            if current is None or current[1] <= now:
                if len(self._entries) >= self.max_entries:
                    self._evict_expired(now)
                self._entries[key] = [1, now + self.window_seconds]
                return
            if current[0] >= self.max_attempts:
                raise RateLimitError(max(1, math.ceil(current[1] - now)))
            current[0] += 1

    def _evict_expired(self, now: float) -> None:
        for key in [key for key, (_, reset_at) in self._entries.items() if reset_at <= now]:
            del self._entries[key]
        while len(self._entries) >= self.max_entries:
            self._entries.pop(next(iter(self._entries)))

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


inquiry_rate_limiter = BoundedRateLimiter()


@dataclass(frozen=True)
class InquiryNotification:
    id: str
    name: str
    email: str
    message: str
    opportunity_type: str


def send_inquiry_notification(inquiry: InquiryNotification) -> None:
    import boto3

    env = load_env()
    boto3.client("sesv2").send_email(
        FromEmailAddress=env.ses_from_email,
        Destination={"ToAddresses": [env.ses_to_email]},
        Content={
            "Simple": {
                "Subject": {"Data": f"New contact inquiry: {inquiry.opportunity_type}"},
                "Body": {"Text": {"Data": f"From: {inquiry.name} <{inquiry.email}>\n\n{inquiry.message}\n\nInquiry ID: {inquiry.id}"}},
            }
        },
    )


def submit_inquiry(
    session: Session,
    data: ContactInput,
    client_identity: str,
    request_id: str | None = None,
    source: str = "contact-form",
    notify: Callable[[InquiryNotification], None] | None = None,
    rate_limiter: BoundedRateLimiter | None = None,
) -> Literal["SENT", "FAILED"]:
    """Store an inquiry, then try to notify the owner. Returns the notification status."""
    (rate_limiter or inquiry_rate_limiter).consume(client_identity)
    repository = InquiryRepository(session)
    inquiry = repository.create(CreateInquiryInput(
        name=data.name, email=data.email, message=data.message, opportunity_type=data.opportunity_type, source=source,
    ))
    try:
        (notify or send_inquiry_notification)(InquiryNotification(
            id=inquiry.id, name=inquiry.name, email=inquiry.email, message=inquiry.message, opportunity_type=inquiry.opportunity_type,
        ))
    except Exception as error:
        repository.update_notification_status(inquiry.id, NotificationStatus.FAILED, str(error) or "Unknown notification failure")
        logger.error("inquiry_notification_failed", {"inquiryId": inquiry.id, "requestId": request_id, "errorType": error_type(error)})
        return "FAILED"
    repository.update_notification_status(inquiry.id, NotificationStatus.SENT)
    return "SENT"
