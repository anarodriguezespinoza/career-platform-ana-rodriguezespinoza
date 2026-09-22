import { describe, expect, it } from "vitest";

import { createLogger, redactLogFields } from "../../src/lib/observability/logger";
import { getRequestContext } from "../../src/lib/observability/request-context";

describe("structured observability", () => {
  it("redacts credentials, tokens, and inquiry message contents", () => {
    const output: unknown[] = [];
    const logger = createLogger((entry) => output.push(entry));

    logger.error("contact_submission_failed", {
      accessToken: "token-secret",
      password: "password-secret",
      authorization: "Bearer bearer-secret",
      message: "This private inquiry must not be logged",
      nested: { clientSecret: "nested-secret", note: "safe metadata" },
    });

    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain("token-secret");
    expect(serialized).not.toContain("password-secret");
    expect(serialized).not.toContain("bearer-secret");
    expect(serialized).not.toContain("This private inquiry must not be logged");
    expect(output).toEqual([
      expect.objectContaining({
        level: "error",
        event: "contact_submission_failed",
        fields: expect.objectContaining({
          accessToken: "[REDACTED]",
          password: "[REDACTED]",
          authorization: "[REDACTED]",
          message: "[REDACTED]",
          nested: { clientSecret: "[REDACTED]", note: "safe metadata" },
        }),
      }),
    ]);
  });

  it("preserves safe structured fields", () => {
    expect(redactLogFields({ inquiryId: "inquiry-1", operation: "publish" })).toEqual({
      inquiryId: "inquiry-1",
      operation: "publish",
    });
  });

  it("uses a supplied correlation ID or creates one", () => {
    expect(getRequestContext(new Request("https://example.com", { headers: { "x-request-id": "req-123" } }))).toEqual({
      requestId: "req-123",
    });
    expect(getRequestContext(new Request("https://example.com"))).toEqual({ requestId: expect.any(String) });
  });
});
