import { generateResumePdf } from "@/domain/resume/generate-pdf";
import { getPublishedResumeData } from "@/domain/resume/resume-data";

export async function GET() {
  try {
    const pdf = await generateResumePdf(await getPublishedResumeData());
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="resume.pdf"',
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("resume_pdf_generation_error", error);
    return new Response("The published resume is temporarily unavailable", { status: 503 });
  }
}
