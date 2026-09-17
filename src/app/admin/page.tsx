import Link from "next/link";
import { PublishControls } from "@/components/admin/publish-controls";

export default function AdminHomePage() {
  return <main><h1>Admin</h1><nav><Link href={"/admin/content" as never}>Content</Link> · <Link href={"/admin/preview" as never}>Preview</Link></nav><PublishControls /></main>;
}
