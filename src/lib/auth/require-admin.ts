import {
  AuthenticationError,
  type AdminIdentity,
  verifyCognitoAccessToken,
} from "@/lib/auth/cognito";
import { loadEnv } from "@/lib/config/env";

export type { AdminIdentity } from "@/lib/auth/cognito";

export async function requireAdmin(request: Request): Promise<AdminIdentity> {
  const header = request.headers.get("authorization");
  const token =
    header?.match(/^Bearer\s+([^\s]+)$/i)?.[1] ??
    request.headers.get("cookie")?.match(/(?:^|;\s*)cognito-access-token=([^;]+)/)?.[1];

  if (!token) {
    throw new AuthenticationError();
  }

  let identity: AdminIdentity;
  try {
    identity = await verifyCognitoAccessToken(token);
  } catch {
    throw new AuthenticationError();
  }

  const env = loadEnv();
  const allowedSubjects = env.cognitoAdminSubject
    ? [env.cognitoAdminSubject]
    : [];
  const allowedEmails = env.cognitoAdminEmails;

  if (allowedSubjects.length === 0 && allowedEmails.length === 0) {
    throw new Response("Forbidden", { status: 403 });
  }

  if (
    !allowedSubjects.includes(identity.subject) &&
    !allowedEmails.includes(identity.email.toLowerCase())
  ) {
    throw new Response("Forbidden", { status: 403 });
  }

  return identity;
}
