import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateStatus, updateNotes, deleteInquiry, requireAdmin, cookies, revalidatePath, deleteService } = vi.hoisted(() => ({
  updateStatus: vi.fn(),
  updateNotes: vi.fn(),
  deleteInquiry: vi.fn(),
  requireAdmin: vi.fn(),
  cookies: vi.fn(),
  revalidatePath: vi.fn(),
  deleteService: vi.fn(),
}));

vi.mock("../../src/lib/db/repositories/inquiry-repository", () => ({ InquiryRepository: vi.fn(() => ({ updateStatus, updateNotes })) }));
vi.mock("../../src/lib/db/client", () => ({ prisma: {} }));
vi.mock("../../src/lib/auth/require-admin", () => ({ requireAdmin }));
vi.mock("next/headers", () => ({ cookies }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("../../src/domain/inquiries/service", () => ({ deleteInquiry: deleteService }));

import { deleteInquiry as deleteAction, updateInquiryNotes, updateInquiryStatus } from "../../src/app/admin/inquiries/actions";

beforeEach(() => {
  vi.clearAllMocks();
  cookies.mockResolvedValue({ get: () => ({ value: "token" }) });
  requireAdmin.mockResolvedValue({ subject: "owner", email: "owner@example.com" });
});

describe("admin inquiry actions", () => {
  it("requires an admin before updating status and notes", async () => {
    await updateInquiryStatus("inquiry-1", "READ");
    await updateInquiryNotes("inquiry-1", "Follow up");
    expect(requireAdmin).toHaveBeenCalledTimes(2);
    expect(updateStatus).toHaveBeenCalledWith("inquiry-1", "READ");
    expect(updateNotes).toHaveBeenCalledWith("inquiry-1", "Follow up");
  });

  it("requires an admin before deleting an inquiry", async () => {
    await deleteAction("inquiry-1");
    expect(deleteService).toHaveBeenCalledWith("inquiry-1", { subject: "owner", email: "owner@example.com" });
  });
});
