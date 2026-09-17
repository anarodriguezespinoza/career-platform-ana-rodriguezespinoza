"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { createAdminContentService, type ContentType, type SaveDraftInput } from "@/domain/content/admin-service";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getRuntimeSnapshotStore } from "@/lib/public/content";

async function adminIdentity() {
  const token = (await cookies()).get("cognito-access-token")?.value;
  return requireAdmin(new Request("https://internal.local/admin", { headers: token ? { cookie: `cognito-access-token=${token}` } : undefined }));
}

function service() {
  return createAdminContentService(getRuntimeSnapshotStore());
}

export async function saveDraft(input: SaveDraftInput) {
  const result = await service().saveDraft(input, await adminIdentity());
  revalidatePath("/admin");
  return result;
}

export async function publishContent() {
  const result = await service().publishContent(await adminIdentity());
  revalidatePath("/", "layout");
  return result;
}

export async function unpublishRecord(type: ContentType, id: string) {
  await service().unpublishRecord(type, id, await adminIdentity());
  revalidatePath("/", "layout");
}

export async function archiveRecord(type: ContentType, id: string) {
  await service().archiveRecord(type, id, await adminIdentity());
  revalidatePath("/admin");
}

export async function previewDraft() {
  return service().previewDraft(await adminIdentity());
}
