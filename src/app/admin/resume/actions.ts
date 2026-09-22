"use server";

import { cookies } from "next/headers";

import { generateResumePdf } from "@/domain/resume/generate-pdf";
import { getPublishedResumeData } from "@/domain/resume/resume-data";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createRequestContext } from "@/lib/observability/request-context";
import { logger } from "@/lib/observability/logger";

export async function generatePublishedResume(): Promise<Uint8Array> {
  const requestId = createRequestContext().requestId;
  const token = (await cookies()).get("cognito-access-token")?.value;
  const actor = await requireAdmin(new Request("https://internal.local/admin/resume", { headers: token ? { cookie: `cognito-access-token=${token}` } : undefined }));
  logger.info("admin_server_action", { operation: "generate_published_resume", actorSubject: actor.subject, requestId });
  return generateResumePdf(await getPublishedResumeData());
}

export async function submitPublishedResume(_formData?: FormData): Promise<void> {
  await generatePublishedResume();
}
