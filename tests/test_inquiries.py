import pytest

from app.domain.inquiries import (
    BoundedRateLimiter,
    ContactInputError,
    RateLimitError,
    submit_inquiry,
    validate_contact_input,
)
from app.models import ContactInquiry

VALID = {"name": "  Grace   Hopper ", "email": " Grace@Example.COM ", "message": " Hello ", "opportunityType": "PROJECT"}


def test_validation_normalizes_input():
    result = validate_contact_input(VALID)
    assert (result.name, result.email, result.message, result.opportunity_type) == ("Grace Hopper", "grace@example.com", "Hello", "PROJECT")


@pytest.mark.parametrize(
    "override",
    [
        {"name": "G"},
        {"name": "x" * 121},
        {"email": "not-an-email"},
        {"email": "a@b"},
        {"message": "   "},
        {"message": "x" * 5001},
        {"opportunityType": "JOB"},
        {"name": 5},
    ],
)
def test_validation_rejects_invalid_input(override):
    with pytest.raises(ContactInputError):
        validate_contact_input({**VALID, **override})


def test_validation_rejects_non_objects():
    with pytest.raises(ContactInputError):
        validate_contact_input(["not", "an", "object"])


def test_rate_limiter_allows_three_attempts_per_window():
    limiter = BoundedRateLimiter(max_attempts=3, window_seconds=60)
    for _ in range(3):
        limiter.consume("client", now=0)
    with pytest.raises(RateLimitError) as error:
        limiter.consume("client", now=10)
    assert error.value.retry_after_seconds == 50
    limiter.consume("other", now=10)
    limiter.consume("client", now=60)


def test_rate_limiter_is_bounded():
    limiter = BoundedRateLimiter(max_attempts=1, window_seconds=60, max_entries=2)
    for key in ("a", "b", "c"):
        limiter.consume(key, now=0)
    assert len(limiter._entries) == 2


def test_submission_stores_inquiry_and_records_sent_notification(session, notifications):
    assert submit_inquiry(session, validate_contact_input(VALID), "client") == "SENT"
    inquiry = session.query(ContactInquiry).one()
    assert (inquiry.status, inquiry.notification_status, inquiry.source) == ("NEW", "SENT", "contact-form")
    assert notifications[0].id == inquiry.id


def test_submission_is_accepted_when_notification_fails(session):
    def fail(_):
        raise RuntimeError("SES rejected the message")

    assert submit_inquiry(session, validate_contact_input(VALID), "client", notify=fail) == "FAILED"
    inquiry = session.query(ContactInquiry).one()
    assert (inquiry.notification_status, inquiry.notification_error) == ("FAILED", "SES rejected the message")
