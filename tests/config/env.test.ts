import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadEnv } from "../../src/lib/config/env";

describe("loadEnv", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses a complete development environment", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/resume");
    vi.stubEnv("COGNITO_ISSUER", "https://cognito.example.com");
    vi.stubEnv("COGNITO_CLIENT_ID", "client-id");
    vi.stubEnv("S3_SNAPSHOT_BUCKET", "resume-snapshots");
    vi.stubEnv("SES_FROM_EMAIL", "from@example.com");
    vi.stubEnv("SES_TO_EMAIL", "to@example.com");

    expect(loadEnv()).toMatchObject({
      nodeEnv: "development",
      databaseUrl: "postgresql://localhost/resume",
      cognitoIssuer: "https://cognito.example.com",
      cognitoClientId: "client-id",
      snapshotBucket: "resume-snapshots",
      sesFromEmail: "from@example.com",
      sesToEmail: "to@example.com",
    });
  });

  it("rejects missing production configuration without exposing secrets", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://secret.example/resume");

    const error = (() => {
      try {
        loadEnv();
        return null;
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(Error);
    expect(error).toHaveProperty(
      "message",
      expect.stringContaining("Missing required environment variables"),
    );
    expect(error).not.toHaveProperty(
      "message",
      expect.stringContaining("postgresql://secret.example/resume"),
    );
  });
});
