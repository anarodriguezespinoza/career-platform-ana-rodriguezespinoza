import { RateLimitError } from "@/domain/inquiries/rate-limit";
import { submitInquiry } from "@/domain/inquiries/service";
import { ContactInputError, validateContactInput } from "@/domain/inquiries/validation";
import { logger } from "@/lib/observability/logger";
import { getRequestContext } from "@/lib/observability/request-context";

export async function POST(request: Request): Promise<Response> {
  const requestContext = getRequestContext(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return responseWithRequestId({ message: "Please check your details and try again." }, 400, requestContext.requestId);
  }

  try {
    const input = validateContactInput(body);
    const clientIdentity = getClientIdentity(request);
    await submitInquiry(input, { clientIdentity, requestId: requestContext.requestId });
    return responseWithRequestId({ message: "Thanks. Your message has been received." }, 201, requestContext.requestId);
  } catch (error) {
    if (error instanceof RateLimitError || error instanceof Error && error.name === "RateLimitError") {
      const retryAfterSeconds = error instanceof RateLimitError ? error.retryAfterSeconds : (error as Error & { retryAfterSeconds?: number }).retryAfterSeconds ?? 60;
      return responseWithRequestId(
        { message: "Please wait before sending another message." },
        429,
        requestContext.requestId,
        { "Retry-After": String(retryAfterSeconds) },
      );
    }
    if (error instanceof ContactInputError || error instanceof Error && error.name === "ContactInputError") {
      return responseWithRequestId({ message: "Please check your details and try again." }, 400, requestContext.requestId);
    }
    logger.error("contact_submission_failed", { requestId: requestContext.requestId, errorType: error instanceof Error ? error.name : "unknown" });
    return responseWithRequestId({ message: "We could not receive your message. Please try again." }, 500, requestContext.requestId);
  }
}

function getClientIdentity(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "anonymous";
}

function responseWithRequestId(body: object, status: number, requestId: string, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...headers, "x-request-id": requestId } });
}
