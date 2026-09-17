import { describe, expect, it, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const { cookies } = vi.hoisted(() => ({ cookies: vi.fn() }));
const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("../../src/lib/auth/require-admin", () => ({ requireAdmin }));
vi.mock("next/headers", () => ({ cookies }));
vi.mock("next/navigation", () => ({ redirect }));

import AdminLayout from "../../src/app/admin/layout";

describe("admin route boundary", () => {
  it("rechecks the session with requireAdmin before rendering", async () => {
    cookies.mockResolvedValue({
      get: () => ({ value: "id-token" }),
    });
    requireAdmin.mockResolvedValue({ subject: "owner", email: "owner@example.com" });
    const children = "protected";

    await expect(AdminLayout({ children })).resolves.toMatchObject({ props: { children } });
    expect(requireAdmin).toHaveBeenCalledWith(expect.any(Request));
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects when the server-side authorization check fails", async () => {
    cookies.mockResolvedValue({ get: () => undefined });
    requireAdmin.mockRejectedValue(new Error("Unauthorized"));

    await AdminLayout({ children: "protected" });

    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });
});
