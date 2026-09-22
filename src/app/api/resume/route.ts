import { generateResumePdf } from "@/domain/resume/generate-pdf";
import { getPublishedResumeData } from "@/domain/resume/resume-data";
import { logger } from "@/lib/observability/logger";
import { getRequestContext } from "@/lib/observability/request-context";

export function GET(request: Request): Promise<Response>;
export function GET(): Promise<Response>;
export async function GET(request?: Request) {
  const { requestId } = getRequestContext(request ?? new Request("https://internal.local/api/resume"));
  try {
    const pdf = await generateResumePdf(await getPublishedResumeData());
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="resume.pdf"',
        "Cache-Control": "public, max-age=300",
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    logger.error("resume_pdf_generation_error", { requestId, errorType: error instanceof Error ? error.name : "unknown" });
    return new Response("The published resume is temporarily unavailable", { status: 503, headers: { "x-request-id": requestId } });
  }
}
