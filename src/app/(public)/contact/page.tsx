import { ContactForm } from "@/components/public/contact-form";
import { metadataFor } from "@/lib/public/metadata";

export const metadata = metadataFor({ title: "Contact — Ana Rodriguez", description: "Send Ana Rodriguez a professional inquiry.", path: "/contact" });

export default function ContactPage() {
  return <div className="page-shell py-16 sm:py-24"><p className="eyebrow">Contact</p><h1 className="page-title">Let’s make something useful.</h1><p className="mt-8 max-w-2xl text-xl leading-9 text-[var(--muted)]">Tell me what you are working on, what you need, or where you see an opportunity to collaborate.</p><ContactForm /></div>;
}
