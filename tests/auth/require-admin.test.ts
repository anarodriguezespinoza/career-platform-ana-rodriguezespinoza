import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyCognitoAccessToken } = vi.hoisted(() => ({
  verifyCognitoAccessToken: vi.fn(),
}));

vi.mock("../../src/lib/auth/cognito", () => ({
  AuthenticationError: class AuthenticationError extends Error {
    status = 401;
    constructor() { super("Unauthorized"); }
  },
  verifyCognitoAccessToken,
}));

import { requireAdmin } from "../../src/lib/auth/require-admin";

describe("requireAdmin", () => {
  beforeEach(() => {
    verifyCognitoAccessToken.mockReset();
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/resume");
    vi.stubEnv("COGNITO_ISSUER", "https://cognito.example.com");
    vi.stubEnv("COGNITO_CLIENT_ID", "client-id");
    vi.stubEnv("COGNITO_ADMIN_SUBJECT", "owner-subject");
    vi.stubEnv("S3_SNAPSHOT_BUCKET", "resume-snapshots");
    vi.stubEnv("SES_FROM_EMAIL", "from@example.com");
    vi.stubEnv("SES_TO_EMAIL", "to@example.com");
  });

  it("returns the verified admin identity for a bearer token", async () => {
    verifyCognitoAccessToken.mockResolvedValue({
      subject: "owner-subject",
      email: "owner@example.com",
    });

    await expect(
      requireAdmin(
        new Request("https://example.com/admin", {
          headers: { authorization: "Bearer access-token" },
        }),
      ),
    ).resolves.toEqual({
      subject: "owner-subject",
      email: "owner@example.com",
    });
  });

  it("rejects missing credentials with a generic unauthorized error", async () => {
    await expect(
      requireAdmin(new Request("https://example.com/admin")),
    ).rejects.toMatchObject({ status: 401 });
    expect(verifyCognitoAccessToken).not.toHaveBeenCalled();
  });

  it("rejects invalid credentials without revealing whether an account exists", async () => {
    verifyCognitoAccessToken.mockRejectedValue(new Error("invalid token details"));

    await expect(
      requireAdmin(
        new Request("https://example.com/admin", {
          headers: { authorization: "Bearer wrong-token" },
        }),
      ),
    ).rejects.toMatchObject({ status: 401, message: "Unauthorized" });
  });
});
