"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { InquiryRepository } from "@/lib/db/repositories/inquiry-repository";
import { prisma } from "@/lib/db/client";
import { requireAdmin, type AdminIdentity } from "@/lib/auth/require-admin";
import { InquiryStatus } from "@/lib/db/types";
import { deleteInquiry as deleteInquiryService } from "@/domain/inquiries/service";

async function adminIdentity(): Promise<AdminIdentity> {
  const token = (await cookies()).get("cognito-access-token")?.value;
  return requireAdmin(new Request("https://internal.local/admin/inquiries", { headers: token ? { cookie: `cognito-access-token=${token}` } : undefined }));
}

const repository = () => new InquiryRepository(prisma);

export async function updateInquiryStatus(id: string, status: InquiryStatus) {
  await adminIdentity();
  if (!Object.values(InquiryStatus).includes(status)) throw new Error("Invalid inquiry status");
  await repository().updateStatus(id, status);
  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${id}`);
}

export async function updateInquiryNotes(id: string, notes: string) {
  await adminIdentity();
  await repository().updateNotes(id, notes);
  revalidatePath(`/admin/inquiries/${id}`);
}

export async function deleteInquiry(id: string) {
  await deleteInquiryService(id, await adminIdentity());
  revalidatePath("/admin/inquiries");
}
