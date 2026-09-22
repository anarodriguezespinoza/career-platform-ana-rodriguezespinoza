import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: { default: "Ana Rodriguez — Software engineer", template: "%s | Ana Rodriguez" }, description: "The professional portfolio of Ana Rodriguez, a product-minded software engineer.", metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000") };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
