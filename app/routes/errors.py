"""Exceptions that route handlers raise to produce HTML error pages or redirects."""

from __future__ import annotations


class NotFoundError(Exception):
    pass


class AdminSignInRequiredError(Exception):
    def __init__(self, return_to: str) -> None:
        super().__init__("Admin sign-in required")
        self.return_to = return_to


class CrossOriginRequestError(Exception):
    pass
