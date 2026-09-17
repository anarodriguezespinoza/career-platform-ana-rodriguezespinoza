import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { verifyCognitoAccessToken } from "../../src/lib/auth/cognito";

async function tokenFor(issuer: string, options: { expiresAt?: string; tokenIssuer?: string } = {}) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  const kid = `${issuer}-key`;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ keys: [{ ...publicJwk, kid, alg: "RS256", use: "sig" }] })),
    ),
  );

  return new SignJWT({ email: "owner@example.com" })
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(options.tokenIssuer ?? issuer)
    .setAudience("client-id")
    .setSubject("owner-subject")
    .setExpirationTime(options.expiresAt ?? "1h")
    .sign(privateKey);
}

describe("verifyCognitoAccessToken", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/resume");
    vi.stubEnv("COGNITO_CLIENT_ID", "client-id");
    vi.stubEnv("S3_SNAPSHOT_BUCKET", "resume-snapshots");
    vi.stubEnv("SES_FROM_EMAIL", "from@example.com");
    vi.stubEnv("SES_TO_EMAIL", "to@example.com");
  });

  it("requires a valid issuer, audience, signature, and expiry", async () => {
    const issuer = "https://issuer-valid.example.com";
    vi.stubEnv("COGNITO_ISSUER", issuer);
    const token = await tokenFor(issuer);

    await expect(verifyCognitoAccessToken(token)).resolves.toEqual({
      subject: "owner-subject",
      email: "owner@example.com",
    });
  });

  it("rejects a token signed by an unknown key", async () => {
    const issuer = "https://issuer-invalid-signature.example.com";
    vi.stubEnv("COGNITO_ISSUER", issuer);
    const token = await tokenFor(issuer);

    await expect(verifyCognitoAccessToken(`${token}tampered`)).rejects.toMatchObject({
      status: 401,
      message: "Unauthorized",
    });
  });

  it("rejects an expired token", async () => {
    const issuer = "https://issuer-expired.example.com";
    vi.stubEnv("COGNITO_ISSUER", issuer);
    const token = await tokenFor(issuer, { expiresAt: "0s" });

    await expect(verifyCognitoAccessToken(token)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a token from the wrong issuer", async () => {
    const issuer = "https://issuer-configured.example.com";
    vi.stubEnv("COGNITO_ISSUER", issuer);
    const token = await tokenFor(issuer, { tokenIssuer: "https://issuer-wrong.example.com" });

    await expect(verifyCognitoAccessToken(token)).rejects.toMatchObject({ status: 401 });
  });
});
