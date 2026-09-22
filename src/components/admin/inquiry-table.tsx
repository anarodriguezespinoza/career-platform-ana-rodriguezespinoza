import Link from "next/link";
import type { PrivateInquiry } from "@/lib/db/repositories/inquiry-repository";

export function InquiryTable({ inquiries }: { inquiries: PrivateInquiry[] }) {
  if (inquiries.length === 0) return <p className="mt-8 text-[var(--muted)]">No inquiries yet.</p>;
  return <div className="mt-8 overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead><tr className="border-b border-[var(--line)]"><th className="p-3">Received</th><th className="p-3">Name</th><th className="p-3">Opportunity</th><th className="p-3">Status</th><th className="p-3">Notification</th></tr></thead><tbody>{inquiries.map((inquiry) => <tr className="border-b border-[var(--line)]" key={inquiry.id}><td className="p-3">{inquiry.createdAt.toLocaleString()}</td><td className="p-3"><Link className="underline" href={`/admin/inquiries/${inquiry.id}` as never}>{inquiry.name}</Link><div className="text-[var(--muted)]">{inquiry.email}</div></td><td className="p-3">{inquiry.opportunityType}</td><td className="p-3">{inquiry.status}</td><td className="p-3">{inquiry.notificationStatus}</td></tr>)}</tbody></table></div>;
}
