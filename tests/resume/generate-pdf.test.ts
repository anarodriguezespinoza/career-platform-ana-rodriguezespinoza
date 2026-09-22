import { describe, expect, it, vi } from "vitest";
import { inflateSync } from "node:zlib";

const { listPublished } = vi.hoisted(() => ({ listPublished: vi.fn() }));

vi.mock("../../src/lib/db/repositories/content-repository", () => ({ ContentRepository: class { listPublished = listPublished; } }));
vi.mock("../../src/lib/db/client", () => ({ prisma: {} }));

const publishedData = {
  profile: { name: "Ana Rodriguez", headline: "Staff Engineer", summary: "Builds reliable products", location: "Madrid" },
  settings: { title: "Ana Rodriguez Resume", intro: "Selected work" },
  experience: [{ company: "Acme", role: "Staff Engineer", description: "Led platform work", startDate: "2022-01-01", endDate: null }],
  projects: [{ name: "Public Platform", description: "A public project", url: "https://example.com", repositoryUrl: null, technologies: ["TypeScript"] }],
  skills: [{ name: "TypeScript", category: "Languages" }],
} as const;

describe("generateResumePdf", () => {
  it("returns a non-empty PDF containing representative published content markers", async () => {
    const { generateResumePdf } = await import("@/domain/resume/generate-pdf");
    const pdf = await generateResumePdf(publishedData);
    const output = Buffer.from(pdf);
    expect(output.length).toBeGreaterThan(100);
    expect(output.subarray(0, 4).toString()).toBe("%PDF");
    expect(output.toString("latin1")).toContain("Ana Rodriguez");
    const compressedStream = output.toString("latin1").match(/stream\n([\s\S]*?)\nendstream/);
    expect(compressedStream).not.toBeNull();
    const streamText = inflateSync(Buffer.from(compressedStream![1], "latin1")).toString("latin1");
    const text = [...streamText.matchAll(/<([0-9a-f]+)>/gi)].map((match) => Buffer.from(match[1], "hex").toString("latin1")).join("");
    expect(text).toContain("Public Platform");
  });

  it("excludes draft records before rendering the PDF", async () => {
    listPublished.mockResolvedValue({
      profile: { id: "profile-1", name: "Ana Rodriguez", headline: "Staff Engineer", summary: "Builds reliable products", email: "private@example.com", location: "Madrid", avatarUrl: null, publicationState: "PUBLISHED", createdAt: new Date(), updatedAt: new Date() },
      resumeSettings: { id: "resume-1", title: "Resume", intro: "Selected work", resumeUrl: null, publicationState: "PUBLISHED", updatedAt: new Date() },
      experience: [],
      projects: [
        { id: "draft-project", slug: "draft", name: "Draft Project", description: "Should not be visible", url: null, repositoryUrl: null, isFeatured: false, displayOrder: 0, publicationState: "DRAFT", createdAt: new Date(), updatedAt: new Date(), technologies: [] },
        { id: "published-project", slug: "published", name: "Published Project", description: "Should be visible", url: null, repositoryUrl: null, isFeatured: true, displayOrder: 1, publicationState: "PUBLISHED", createdAt: new Date(), updatedAt: new Date(), technologies: [] },
      ],
      skills: [],
    });

    const { getPublishedResumeData } = await import("@/domain/resume/resume-data");
    const { generateResumePdf } = await import("@/domain/resume/generate-pdf");
    const data = await getPublishedResumeData();
    const pdf = await generateResumePdf(data);
    const output = Buffer.from(pdf).toString("latin1");

    expect(data.projects.map((project) => project.name)).toEqual(["Published Project"]);
    expect(output).not.toContain("Draft Project");
  });
});

describe("admin resume generation", () => {
  it("requires authorization before generating a resume", async () => {
    vi.resetModules();
    vi.doMock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue(new Map()) }));
    vi.doMock("@/lib/auth/require-admin", () => ({ requireAdmin: vi.fn().mockRejectedValue(new Error("unauthorized")) }));
    const { generatePublishedResume } = await import("@/app/admin/resume/actions");
    await expect(generatePublishedResume()).rejects.toThrow("unauthorized");
  });
});
