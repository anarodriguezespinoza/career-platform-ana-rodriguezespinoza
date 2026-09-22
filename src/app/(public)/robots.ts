import type { MetadataRoute } from "next";
import { siteUrl } from "../../lib/public/metadata";
export default function robots(): MetadataRoute.Robots { return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/sign-in", "/api/"] }], sitemap: new URL("/sitemap.xml", siteUrl).toString() }; }
