import { beforeEach, describe, expect, it, vi } from "vitest";

const listPublished = vi.fn();

vi.mock("@/lib/db/repositories/content-repository", () => ({
  ContentRepository: class {
    listPublished = listPublished;
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: {} }));

describe("getPublishedResumeData", () => {
  beforeEach(() => {
    listPublished.mockReset();
  });

  it("projects only published content and excludes private database fields", async () => {
    listPublished.mockResolvedValue({
      profile: {
        id: "profile-1", name: "Ana Rodriguez", headline: "Engineer", summary: "Builder", email: "ana@example.com", location: "Madrid", avatarUrl: null,
        publicationState: "PUBLISHED", createdAt: new Date(), updatedAt: new Date(),
      },
      experience: [{ id: "exp-published", company: "Acme", role: "Engineer", description: "Built things", startDate: new Date("2022-01-01"), endDate: null, displayOrder: 1, publicationState: "PUBLISHED", createdAt: new Date(), updatedAt: new Date() }],
      projects: [{ id: "project-published", slug: "public", name: "Public project", description: "Visible", url: "https://example.com", repositoryUrl: null, isFeatured: true, displayOrder: 1, publicationState: "PUBLISHED", createdAt: new Date(), updatedAt: new Date(), technologies: [{ projectId: "project-published", technology: "TypeScript", displayOrder: 0 }] }],
      skills: [{ id: "skill-published", name: "TypeScript", category: "Languages", displayOrder: 1, publicationState: "PUBLISHED", createdAt: new Date(), updatedAt: new Date() }],
      resumeSettings: { id: "resume-1", title: "Resume", intro: "Intro", resumeUrl: null, publicationState: "PUBLISHED", updatedAt: new Date() },
    });

    const { getPublishedResumeData } = await import("@/domain/resume/resume-data");
    const result = await getPublishedResumeData();

    expect(result.profile.name).toBe("Ana Rodriguez");
    expect(result.experience[0].company).toBe("Acme");
    expect(result.projects[0].technologies).toEqual(["TypeScript"]);
    expect(result.skills).toEqual([{ name: "TypeScript", category: "Languages" }]);
    expect(result).not.toHaveProperty("publicationState");
    expect(result).not.toHaveProperty("email");
    expect(JSON.stringify(result)).not.toContain("createdAt");
  });

  it("fails clearly when required published resume data is unavailable", async () => {
    listPublished.mockResolvedValue({ profile: null, experience: [], projects: [], skills: [], resumeSettings: null });
    const { getPublishedResumeData } = await import("@/domain/resume/resume-data");
    await expect(getPublishedResumeData()).rejects.toThrow("Published resume data is unavailable");
  });
});
