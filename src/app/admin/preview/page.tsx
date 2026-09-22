import { PreviewFrame } from "@/components/admin/preview-frame";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminContentService } from "@/domain/content/admin-service";
export default async function PreviewPage() { const token = (await cookies()).get("cognito-access-token")?.value; const actor = await requireAdmin(new Request("https://internal.local/admin", { headers: token ? { cookie: `cognito-access-token=${token}` } : undefined })); const content = await createAdminContentService().previewDraft(actor); return <main><h1>Draft preview</h1><PreviewFrame content={content} /></main>; }
