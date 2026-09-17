import type { MetadataRoute } from "next";
import { getPublicContent } from "../../lib/public/content";
import { PublicContentUnavailableError } from "../../lib/fallback/snapshot-service";
import { siteUrl } from "../../lib/public/metadata";

export const dynamic = "force-dynamic";
export function buildPublicSitemap(origin: string, slugs: string[]): MetadataRoute.Sitemap { const routes = [{ path: "/", changeFrequency: "monthly" as const, priority: 1 }, { path: "/about", changeFrequency: "monthly" as const, priority: 0.8 }, { path: "/experience", changeFrequency: "monthly" as const, priority: 0.8 }, { path: "/projects", changeFrequency: "monthly" as const, priority: 0.9 }, ...slugs.map((slug) => ({ path: `/projects/${slug}`, changeFrequency: "monthly" as const, priority: 0.7 })), { path: "/skills", changeFrequency: "monthly" as const, priority: 0.8 }, { path: "/resume", changeFrequency: "monthly" as const, priority: 0.8 }]; return routes.map(({ path, ...entry }) => ({ url: new URL(path, origin).toString(), ...entry })); }
export default async function sitemap(): Promise<MetadataRoute.Sitemap> { try { const { content } = await getPublicContent(); return buildPublicSitemap(siteUrl, content.projects.map((project) => project.slug)); } catch (error) { if (error instanceof PublicContentUnavailableError) return buildPublicSitemap(siteUrl, []); throw error; } }
