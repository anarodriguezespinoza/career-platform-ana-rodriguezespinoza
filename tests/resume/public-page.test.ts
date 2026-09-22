import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/public/content", () => ({
  getPublicContent: vi.fn().mockResolvedValue({
    source: "database",
    content: { profile: { summary: "Summary" }, resumeSettings: { title: "Resume", intro: "Intro", resumeUrl: "https://legacy.example/resume.pdf" } },
  }),
}));
vi.mock("../../src/components/public/source-status", () => ({ SourceStatus: () => null }));
vi.mock("../../src/lib/public/metadata", () => ({ metadataFor: () => ({}) }));

import ResumePage from "../../src/app/(public)/resume/page";

describe("public resume page", () => {
  it("links to the generated published resume endpoint", async () => {
    const result = await ResumePage();
    const link = result.props.children.find((child: { type?: string }) => child?.type === "a");

    expect(link.props.href).toBe("/api/resume");
  });
});
