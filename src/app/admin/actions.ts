"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { createAdminContentService, type ContentType, type SaveDraftInput } from "@/domain/content/admin-service";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getRuntimeSnapshotStore } from "@/lib/public/content";
import { createRequestContext } from "@/lib/observability/request-context";
import { logger } from "@/lib/observability/logger";

async function adminIdentity() {
  const token = (await cookies()).get("cognito-access-token")?.value;
  return requireAdmin(new Request("https://internal.local/admin", { headers: token ? { cookie: `cognito-access-token=${token}` } : undefined }));
}

function service() {
  return createAdminContentService(getRuntimeSnapshotStore());
}

export async function saveDraft(input: SaveDraftInput) {
  const requestId = createRequestContext().requestId;
  const result = await service().saveDraft(input, await adminIdentity(), requestId);
  revalidatePath("/admin");
  return result;
}

export async function publishContent() {
  const requestId = createRequestContext().requestId;
  const result = await service().publishContent(await adminIdentity(), requestId);
  revalidatePath("/", "layout");
  return result;
}

export async function unpublishRecord(type: ContentType, id: string) {
  const requestId = createRequestContext().requestId;
  await service().unpublishRecord(type, id, await adminIdentity(), requestId);
  revalidatePath("/", "layout");
}

export async function archiveRecord(type: ContentType, id: string) {
  const requestId = createRequestContext().requestId;
  await service().archiveRecord(type, id, await adminIdentity(), requestId);
  revalidatePath("/admin");
}

export async function previewDraft() {
  const requestId = createRequestContext().requestId;
  logger.info("admin_server_action", { operation: "preview_draft", requestId });
  return service().previewDraft(await adminIdentity(), requestId);
}
