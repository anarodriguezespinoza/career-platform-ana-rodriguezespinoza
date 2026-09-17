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
  return <>{children}</>;
}
