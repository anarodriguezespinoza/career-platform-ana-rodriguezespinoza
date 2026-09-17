import { RateLimitError } from "@/domain/inquiries/rate-limit";
import { submitInquiry } from "@/domain/inquiries/service";
import { ContactInputError, validateContactInput } from "@/domain/inquiries/validation";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Please check your details and try again." }, { status: 400 });
  }

  try {
    const input = validateContactInput(body);
    const clientIdentity = getClientIdentity(request);
    await submitInquiry(input, { clientIdentity });
    return Response.json({ message: "Thanks. Your message has been received." }, { status: 201 });
  } catch (error) {
    if (error instanceof RateLimitError || error instanceof Error && error.name === "RateLimitError") {
      const retryAfterSeconds = error instanceof RateLimitError ? error.retryAfterSeconds : (error as Error & { retryAfterSeconds?: number }).retryAfterSeconds ?? 60;
      return Response.json(
        { message: "Please wait before sending another message." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
      );
    }
    if (error instanceof ContactInputError || error instanceof Error && error.name === "ContactInputError") {
      return Response.json({ message: "Please check your details and try again." }, { status: 400 });
    }
    console.error("Contact submission failed", { error: error instanceof Error ? error.message : "Unknown error" });
    return Response.json({ message: "We could not receive your message. Please try again." }, { status: 500 });
  }
}

function getClientIdentity(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "anonymous";
}
