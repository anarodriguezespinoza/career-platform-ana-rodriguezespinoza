import { describe, expect, it, vi } from "vitest";

const { getPublishedResumeData, generateResumePdf } = vi.hoisted(() => ({ getPublishedResumeData: vi.fn(), generateResumePdf: vi.fn() }));

vi.mock("../../src/domain/resume/resume-data", () => ({ getPublishedResumeData }));
vi.mock("../../src/domain/resume/generate-pdf", () => ({ generateResumePdf }));

import { GET } from "../../src/app/api/resume/route";

const pdf = new Uint8Array([37, 80, 68, 70, 45, 49]);

describe("GET /api/resume", () => {
  it("returns the published PDF with download headers", async () => {
    getPublishedResumeData.mockResolvedValue({});
    generateResumePdf.mockResolvedValue(pdf);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="resume.pdf"');
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf);
  });

  it("returns a temporary error when published data or PDF generation fails", async () => {
    getPublishedResumeData.mockRejectedValue(new Error("database unavailable"));

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe("The published resume is temporarily unavailable");
  });
});
