import { cookies } from "next/headers";
import { InquiryTable } from "@/components/admin/inquiry-table";
import { InquiryRepository } from "@/lib/db/repositories/inquiry-repository";
import { prisma } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function InquiriesPage() {
  const token = (await cookies()).get("cognito-access-token")?.value;
  await requireAdmin(new Request("https://internal.local/admin/inquiries", { headers: token ? { cookie: `cognito-access-token=${token}` } : undefined }));
  const inquiries = await new InquiryRepository(prisma).list({});
  return <main className="page-shell py-12"><p className="eyebrow">Admin</p><h1 className="page-title">Inquiries</h1><InquiryTable inquiries={inquiries} /></main>;
}
