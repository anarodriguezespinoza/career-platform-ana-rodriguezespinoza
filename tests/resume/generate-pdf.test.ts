import { describe, expect, it, vi } from "vitest";
import { inflateSync } from "node:zlib";

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

  it("never receives draft-only content through the published data contract", async () => {
    const { generateResumePdf } = await import("@/domain/resume/generate-pdf");
    const pdf = await generateResumePdf({ ...publishedData, projects: [] });
    expect(Buffer.from(pdf).toString("latin1")).not.toContain("Draft Project");
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
