import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import { loadEnv } from "@/lib/config/env";

export type AdminIdentity = {
  subject: string;
  email: string;
};

export class AuthenticationError extends Error {
  readonly status = 401;

  constructor() {
    super("Unauthorized");
    this.name = "AuthenticationError";
  }
}

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function verifyCognitoAccessToken(
  token: string,
): Promise<AdminIdentity> {
  const env = loadEnv();
  const issuer = env.cognitoIssuer.replace(/\/$/, "");
  const jwks = getJwks(issuer);

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: env.cognitoClientId,
    });

    if (payload.token_use !== "id") {
      throw new AuthenticationError();
    }

    return mapIdentity(payload);
  } catch {
    throw new AuthenticationError();
  }
}

function getJwks(issuer: string) {
  const existing = jwksByIssuer.get(issuer);
  if (existing) return existing;

  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  jwksByIssuer.set(issuer, jwks);
  return jwks;
}

function mapIdentity(payload: JWTPayload): AdminIdentity {
  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    payload.email.length === 0
  ) {
    throw new AuthenticationError();
  }

  return { subject: payload.sub, email: payload.email };
}
