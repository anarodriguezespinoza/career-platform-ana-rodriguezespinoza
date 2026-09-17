import type { Metadata } from "next";
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
export function metadataFor(options: { title: string; description: string; path: string; siteUrl?: string }): Metadata {
  const url = new URL(options.path, options.siteUrl ?? siteUrl).toString();
  return { title: options.title, description: options.description, alternates: { canonical: url }, openGraph: { type: "website", title: options.title, description: options.description, url, siteName: "Ana Rodriguez" }, twitter: { card: "summary_large_image", title: options.title, description: options.description } };
}
