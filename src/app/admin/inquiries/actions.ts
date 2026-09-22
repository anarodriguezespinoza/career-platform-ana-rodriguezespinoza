"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { InquiryRepository } from "@/lib/db/repositories/inquiry-repository";
import { prisma } from "@/lib/db/client";
import { requireAdmin, type AdminIdentity } from "@/lib/auth/require-admin";
import { InquiryStatus } from "@/lib/db/types";
import { deleteInquiry as deleteInquiryService } from "@/domain/inquiries/service";
import { createRequestContext } from "@/lib/observability/request-context";
import { logger } from "@/lib/observability/logger";

async function adminIdentity(): Promise<AdminIdentity> {
  const token = (await cookies()).get("cognito-access-token")?.value;
  return requireAdmin(new Request("https://internal.local/admin/inquiries", { headers: token ? { cookie: `cognito-access-token=${token}` } : undefined }));
}

const repository = () => new InquiryRepository(prisma);

export async function updateInquiryStatus(id: string, status: InquiryStatus) {
  const requestId = createRequestContext().requestId;
  const actor = await adminIdentity();
  logger.info("admin_server_action", { operation: "update_inquiry_status", inquiryId: id, actorSubject: actor.subject, requestId });
  if (!Object.values(InquiryStatus).includes(status)) throw new Error("Invalid inquiry status");
  await repository().updateStatus(id, status);
  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${id}`);
}

export async function updateInquiryNotes(id: string, notes: string) {
  const requestId = createRequestContext().requestId;
  const actor = await adminIdentity();
  logger.info("admin_server_action", { operation: "update_inquiry_notes", inquiryId: id, actorSubject: actor.subject, requestId });
  await repository().updateNotes(id, notes);
  revalidatePath(`/admin/inquiries/${id}`);
}

export async function deleteInquiry(id: string) {
  const requestId = createRequestContext().requestId;
  const actor = await adminIdentity();
  logger.info("admin_server_action", { operation: "delete_inquiry", inquiryId: id, actorSubject: actor.subject, requestId });
  await deleteInquiryService(id, actor);
  revalidatePath("/admin/inquiries");
}
