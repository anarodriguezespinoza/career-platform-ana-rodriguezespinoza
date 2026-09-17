import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET(request: Request) {
  try {
    const user = await requireAdmin(request);
    const response = Response.json({ authenticated: true, user });
    response.headers.set(
      "Set-Cookie",
      `cognito-access-token=${extractToken(request) ?? ""}; HttpOnly; Path=/; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    return response;
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response("Unauthorized", { status: 401 });
  }
}

function extractToken(request: Request) {
  return (
    request.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1] ??
    request.headers.get("cookie")?.match(/(?:^|;\s*)cognito-access-token=([^;]+)/)?.[1]
  );
}
