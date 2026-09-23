"""Structured, redacting JSON logging and request correlation."""

from __future__ import annotations

import json
import re
import sys
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

from starlette.requests import Request

LogLevel = Literal["info", "warn", "error"]
LogEntry = dict[str, Any]
LogSink = Callable[[LogEntry], None]

REDACTED = "[REDACTED]"
_SENSITIVE_KEY = re.compile(
    r"(authorization|access.?token|api.?key|client.?secret|credential|password|secret|token|message|body|content)",
    re.IGNORECASE,
)


def redact_log_fields(fields: dict[str, Any]) -> dict[str, Any]:
    return _redact(fields)


def _redact(value: Any, key: str | None = None) -> Any:
    if key and _SENSITIVE_KEY.search(key):
        return REDACTED
    if isinstance(value, (list, tuple)):
        return [_redact(item) for item in value]
    if isinstance(value, dict):
        return {entry_key: _redact(entry_value, entry_key) for entry_key, entry_value in value.items()}
    return value


def _default_sink(entry: LogEntry) -> None:
    stream = sys.stderr if entry["level"] in ("warn", "error") else sys.stdout
    print(json.dumps(entry, default=str), file=stream, flush=True)


class Logger:
    def __init__(self, sink: LogSink = _default_sink) -> None:
        self._sink = sink

    def _log(self, level: LogLevel, event: str, fields: dict[str, Any] | None) -> None:
        self._sink({
            "level": level,
            "event": event,
            "fields": redact_log_fields(fields or {}),
            "timestamp": datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        })

    def info(self, event: str, fields: dict[str, Any] | None = None) -> None:
        self._log("info", event, fields)

    def warn(self, event: str, fields: dict[str, Any] | None = None) -> None:
        self._log("warn", event, fields)

    def error(self, event: str, fields: dict[str, Any] | None = None) -> None:
        self._log("error", event, fields)


def create_logger(sink: LogSink = _default_sink) -> Logger:
    return Logger(sink)


logger = create_logger()


@dataclass(frozen=True)
class RequestContext:
    request_id: str


def create_request_context(request_id: str | None = None) -> RequestContext:
    return RequestContext(request_id=(request_id or "").strip() or str(uuid.uuid4()))


def get_request_context(request: Request) -> RequestContext:
    return create_request_context(request.headers.get("x-request-id"))


def error_type(error: BaseException) -> str:
    return type(error).__name__
