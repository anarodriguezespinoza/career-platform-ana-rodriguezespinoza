import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/require-admin";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const token = (await cookies()).get("cognito-access-token")?.value;
  try {
    await requireAdmin(new Request("https://internal.local/admin", { headers: token ? { cookie: `cognito-access-token=${token}` } : undefined }));
  } catch {
    redirect("/sign-in");
  }
  return <><header><nav aria-label="Admin navigation"><Link href={"/admin" as never}>Dashboard</Link> · <Link href={"/admin/content" as never}>Content</Link> · <Link href={"/admin/preview" as never}>Preview</Link> · <Link href={"/admin/inquiries" as never}>Inquiries</Link></nav></header>{children}</>;
}
