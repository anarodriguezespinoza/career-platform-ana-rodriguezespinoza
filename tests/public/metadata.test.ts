import { describe, expect, it } from "vitest";

import { buildPublicSitemap } from "../../src/app/(public)/sitemap";
import { metadataFor } from "../../src/lib/public/metadata";

const siteUrl = "https://ana.example.com";

describe("public metadata", () => {
  it("includes canonical and social metadata for a route", () => {
    const metadata = metadataFor({ title: "Projects", description: "Selected work", path: "/projects", siteUrl });

    expect(metadata.alternates?.canonical).toBe("https://ana.example.com/projects");
    expect(metadata.openGraph).toMatchObject({ title: "Projects", description: "Selected work", url: "https://ana.example.com/projects" });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", description: "Selected work" });
  });

  it("includes only published public routes in the sitemap", () => {
    expect(buildPublicSitemap(siteUrl, ["published-project"])).toEqual([
      { url: "https://ana.example.com/", changeFrequency: "monthly", priority: 1 },
      { url: "https://ana.example.com/about", changeFrequency: "monthly", priority: 0.8 },
      { url: "https://ana.example.com/experience", changeFrequency: "monthly", priority: 0.8 },
      { url: "https://ana.example.com/projects", changeFrequency: "monthly", priority: 0.9 },
      { url: "https://ana.example.com/projects/published-project", changeFrequency: "monthly", priority: 0.7 },
      { url: "https://ana.example.com/skills", changeFrequency: "monthly", priority: 0.8 },
      { url: "https://ana.example.com/resume", changeFrequency: "monthly", priority: 0.8 },
      { url: "https://ana.example.com/contact", changeFrequency: "monthly", priority: 0.7 },
    ]);
  });
});
