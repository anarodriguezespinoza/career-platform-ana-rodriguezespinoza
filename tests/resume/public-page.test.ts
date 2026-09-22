import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPublicContent } = vi.hoisted(() => ({ getPublicContent: vi.fn() }));

vi.mock("../../src/lib/public/content", () => ({ getPublicContent }));
vi.mock("../../src/components/public/source-status", () => ({ SourceStatus: () => null }));
vi.mock("../../src/lib/public/metadata", () => ({ metadataFor: () => ({}) }));

import ResumePage from "../../src/app/(public)/resume/page";

function findLink(result: { props: { children: unknown[] } }) {
  return result.props.children.find((child: unknown) => typeof child === "object" && child !== null && "type" in child && (child as { type?: string }).type === "a") as { props: { href: string } } | undefined;
}

beforeEach(() => {
  getPublicContent.mockReset();
});

describe("public resume page", () => {
  it("links to the generated endpoint for complete live published content", async () => {
    getPublicContent.mockResolvedValue({
      source: "database",
      content: {
        profile: { name: "Ana", headline: "Engineer", summary: "Summary", location: "Madrid" },
        resumeSettings: { title: "Resume", intro: "Intro", resumeUrl: "https://legacy.example/resume.pdf" },
      },
    });

    const link = findLink(await ResumePage());

    expect(link?.props.href).toBe("/api/resume");
  });

  it("uses the published legacy URL when content comes from a snapshot", async () => {
    getPublicContent.mockResolvedValue({
      source: "snapshot",
      content: {
        profile: { summary: "Snapshot summary" },
        resumeSettings: { title: "Snapshot Resume", intro: "Snapshot intro", resumeUrl: "https://legacy.example/resume.pdf" },
      },
    });

    const link = findLink(await ResumePage());

    expect(link?.props.href).toBe("https://legacy.example/resume.pdf");
  });

  it("shows the on-request state when no usable published resume is available", async () => {
    getPublicContent.mockResolvedValue({
      source: "snapshot",
      content: { profile: { summary: "Snapshot summary" }, resumeSettings: { title: "Snapshot Resume", intro: "Snapshot intro", resumeUrl: null } },
    });

    const result = await ResumePage();

    expect(findLink(result)).toBeUndefined();
    expect(result.props.children.some((child: unknown) => typeof child === "object" && child !== null && "props" in child && (child as { props: { children?: string } }).props.children?.includes("available on request"))).toBe(true);
  });
});
