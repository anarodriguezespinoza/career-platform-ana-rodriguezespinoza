"use server";

import { cookies } from "next/headers";

import { generateResumePdf } from "@/domain/resume/generate-pdf";
import { getPublishedResumeData } from "@/domain/resume/resume-data";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function generatePublishedResume(): Promise<Uint8Array> {
  const token = (await cookies()).get("cognito-access-token")?.value;
  await requireAdmin(new Request("https://internal.local/admin/resume", { headers: token ? { cookie: `cognito-access-token=${token}` } : undefined }));
  return generateResumePdf(await getPublishedResumeData());
}

export async function submitPublishedResume(_formData?: FormData): Promise<void> {
  await generatePublishedResume();
}
