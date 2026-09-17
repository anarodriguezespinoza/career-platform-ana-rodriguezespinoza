import { describe, expect, it, vi } from "vitest";

import type { PublicContent } from "../../src/domain/content/types";

const publicContent: PublicContent = {
  profile: {
    id: "profile-1",
    name: "Ana Rodriguez",
    headline: "Product-minded software engineer",
    summary: "Builds useful systems.",
    email: "ana@example.com",
    location: "Remote",
    avatarUrl: null,
  },
  experience: [],
  projects: [
    {
      id: "project-1",
      slug: "published-project",
      name: "Published project",
      description: "A published project.",
      url: null,
      repositoryUrl: null,
      displayOrder: 0,
      technologies: [],
    },
  ],
  skills: [],
  resumeSettings: null,
};

describe("public content access", () => {
  it("loads the public projection without using draft repository methods", async () => {
    const readPublicContent = vi.fn(async (load: () => Promise<unknown>) => { await load(); return { content: publicContent, source: "database" as const }; });
    const loadLive = vi.fn().mockResolvedValue({
      profile: { publicationState: "PUBLISHED", name: "Ana", headline: "Engineer", summary: "Summary", email: "ana@example.com", location: "Remote" },
      experience: [],
      projects: [],
      skills: [],
      resumeSettings: null,
    });

    const { createPublicContentReader } = await import("../../src/lib/public/content");
    const reader = createPublicContentReader({ loadLive, readPublicContent });

    await expect(reader()).resolves.toEqual({ content: publicContent, source: "database" });
    expect(loadLive).toHaveBeenCalledTimes(1);
    expect(readPublicContent).toHaveBeenCalledTimes(1);
  });

  it("does not expose archived or unknown projects through the public slug reader", async () => {
    const { findPublicProject } = await import("../../src/lib/public/content");

    await expect(findPublicProject("missing", publicContent)).resolves.toBeNull();
    await expect(findPublicProject("published-project", publicContent)).resolves.toEqual(publicContent.projects[0]);
  });

  it("rejects malformed project slugs before looking up content", async () => {
    const { findPublicProject } = await import("../../src/lib/public/content");

    await expect(findPublicProject("../private", publicContent)).resolves.toBeNull();
  });
});
