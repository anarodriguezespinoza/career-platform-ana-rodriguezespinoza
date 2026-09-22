import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { InquiryRepository } from "@/lib/db/repositories/inquiry-repository";
import { DeleteInquiryButton } from "@/components/admin/delete-inquiry-button";
import { prisma } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/require-admin";
import { InquiryStatus } from "@/lib/db/types";
import { deleteInquiry, updateInquiryNotes, updateInquiryStatus } from "../actions";

export default async function InquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get("cognito-access-token")?.value;
  await requireAdmin(new Request("https://internal.local/admin/inquiries", { headers: token ? { cookie: `cognito-access-token=${token}` } : undefined }));
  const { id } = await params;
  const inquiry = await new InquiryRepository(prisma).findById(id);
  if (!inquiry) notFound();
  return <main className="page-shell py-12"><p className="eyebrow">Inquiry</p><h1 className="page-title">{inquiry.name}</h1><dl className="mt-8 grid gap-4"><div><dt className="font-semibold">Email</dt><dd><a className="underline" href={`mailto:${inquiry.email}`}>{inquiry.email}</a></dd></div><div><dt className="font-semibold">Opportunity</dt><dd>{inquiry.opportunityType}</dd></div><div><dt className="font-semibold">Message</dt><dd className="whitespace-pre-wrap">{inquiry.message}</dd></div><div><dt className="font-semibold">Notification</dt><dd>{inquiry.notificationStatus}{inquiry.notificationError ? ` — ${inquiry.notificationError}` : ""}</dd></div></dl><form className="mt-8 flex gap-3" action={async (formData) => { "use server"; await updateInquiryStatus(id, formData.get("status") as InquiryStatus); }}><label className="grid gap-2 font-semibold" htmlFor="status">Status<select className="border border-[var(--line)] px-3 py-2 font-normal" id="status" name="status" defaultValue={inquiry.status}>{Object.values(InquiryStatus).map((status) => <option key={status}>{status}</option>)}</select></label><button className="button-secondary self-end" type="submit">Update status</button></form><form className="mt-8 grid max-w-2xl gap-3" action={async (formData) => { "use server"; await updateInquiryNotes(id, String(formData.get("privateNotes") ?? "")); }}><label className="grid gap-2 font-semibold" htmlFor="privateNotes">Private notes<textarea className="min-h-32 border border-[var(--line)] px-3 py-2 font-normal" id="privateNotes" name="privateNotes" defaultValue={inquiry.privateNotes} /></label><button className="button-secondary justify-self-start" type="submit">Save notes</button></form><div className="mt-8"><DeleteInquiryButton action={async () => { "use server"; await deleteInquiry(id); }} /></div></main>;
}
