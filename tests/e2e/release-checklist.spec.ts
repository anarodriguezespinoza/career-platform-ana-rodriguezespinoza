import { test, expect } from "@playwright/test";
import { uniqueInquiryMessage } from "./support";

test.describe("public release checklist", () => {
  test("returns 404 for an unknown project", async ({ request }) => {
    const response = await request.get("/projects/project-that-does-not-exist");

    expect(response.status()).toBe(404);
  });

  test("downloads the published resume as a PDF", async ({ request }) => {
    const response = await request.get("/api/resume");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
    expect(response.headers()["content-disposition"]).toContain('filename="resume.pdf"');
    expect((await response.body()).subarray(0, 4).toString()).toBe("%PDF");
  });

  test("rejects invalid contact data and rate limits repeated submissions", async ({ request }) => {
    const invalid = await request.post("/api/contact", {
      data: { name: "", email: "not-an-email", message: "", opportunityType: "PROJECT" },
    });
    expect(invalid.status()).toBe(400);

    const clientIP = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const payload = {
      name: "Release Checklist",
      email: "release-checklist@example.com",
      message: uniqueInquiryMessage(),
      opportunityType: "PROJECT",
    };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const accepted = await request.post("/api/contact", {
        headers: { "x-forwarded-for": clientIP },
        data: payload,
      });
      expect(accepted.status()).toBe(201);
    }

    const rateLimited = await request.post("/api/contact", {
      headers: { "x-forwarded-for": clientIP },
      data: payload,
    });
    expect(rateLimited.status()).toBe(429);
    expect(rateLimited.headers()["retry-after"]).toBeTruthy();
  });

  test("reports database-backed health", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      database: "up",
      publicSource: "database",
    });
  });
});
