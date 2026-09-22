import { describe, expect, it, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}));

vi.mock("../../src/lib/auth/require-admin", () => ({
  requireAdmin,
}));

import { GET } from "../../src/app/api/auth/session/route";

describe("GET /api/auth/session", () => {
  it("returns the minimal admin session when authorized", async () => {
    requireAdmin.mockResolvedValue({
      subject: "owner-subject",
      email: "owner@example.com",
    });

    const response = await GET(
      new Request("https://example.com/api/auth/session", {
        headers: { authorization: "Bearer access-token" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authenticated: true,
      user: { subject: "owner-subject", email: "owner@example.com" },
    });
  });

  it("returns a generic unauthorized response for invalid sessions", async () => {
    requireAdmin.mockRejectedValue(new Response("Unauthorized", { status: 401 }));

    const response = await GET(
      new Request("https://example.com/api/auth/session"),
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
  });
});
