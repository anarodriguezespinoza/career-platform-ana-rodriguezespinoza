"""Release-gate browser tests. Run with `pytest e2e` (requires the `e2e` extra and `playwright install chromium`)."""

from __future__ import annotations

import os
import re
import socket
import subprocess
import sys
import time
from collections.abc import Iterator

import pytest
from playwright.sync_api import Page, expect

REQUIRED = ("E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD", "E2E_FALLBACK_BASE_URL")


def pytest_configure(config: pytest.Config) -> None:
    missing = [name for name in REQUIRED if not os.environ.get(name)]
    if missing:
        raise pytest.UsageError(
            f"Release E2E prerequisites missing: {', '.join(missing)}. Configure development-only Cognito credentials "
            "and a fallback deployment; no release E2E scenarios may be skipped."
        )


def _wait_for_port(host: str, port: int, timeout: float = 60) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with socket.socket() as sock:
            if sock.connect_ex((host, port)) == 0:
                return
        time.sleep(0.2)
    raise RuntimeError(f"Server did not start on {host}:{port}")


@pytest.fixture(scope="session")
def base_url() -> Iterator[str]:
    external = os.environ.get("E2E_BASE_URL")
    if external:
        yield external.rstrip("/")
        return
    server = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        env={"APP_ENV": "development", **os.environ},
    )
    try:
        _wait_for_port("127.0.0.1", 8000)
        yield "http://127.0.0.1:8000"
    finally:
        server.terminate()
        server.wait(timeout=10)


def sign_in_as_admin(page: Page) -> None:
    page.goto("/sign-in")
    page.get_by_label("Email").fill(os.environ["E2E_ADMIN_EMAIL"])
    page.get_by_label("Password").fill(os.environ["E2E_ADMIN_PASSWORD"])
    page.get_by_role("button", name="Sign in").click()
    expect(page).to_have_url(re.compile(r"/admin/?$"))


def unique_inquiry_message() -> str:
    return f"Playwright release-gate inquiry {time.time_ns()}"
