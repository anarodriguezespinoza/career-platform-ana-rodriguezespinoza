import { beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../src/lib/observability/logger";

const { create, updateNotificationStatus, sendInquiryNotification } = vi.hoisted(() => ({
  create: vi.fn(),
  updateNotificationStatus: vi.fn(),
  sendInquiryNotification: vi.fn(),
}));

vi.mock("../../src/lib/db/repositories/inquiry-repository", () => ({
  InquiryRepository: vi.fn(() => ({ create, updateNotificationStatus })),
}));
vi.mock("../../src/lib/db/client", () => ({ prisma: {} }));
vi.mock("../../src/lib/email/ses", () => ({ sendInquiryNotification }));

import { inquiryRateLimiter, RateLimitError } from "../../src/domain/inquiries/rate-limit";
import { submitInquiry } from "../../src/domain/inquiries/service";

const input = {
  name: "Visitor",
  email: "visitor@example.com",
  message: "I would like to discuss a project.",
  opportunityType: "PROJECT" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  inquiryRateLimiter.clear();
  create.mockResolvedValue({ id: "inquiry-1", ...input, source: "contact-form", notificationStatus: "PENDING" });
  updateNotificationStatus.mockResolvedValue(undefined);
  sendInquiryNotification.mockResolvedValue({ delivered: true });
});

describe("submitInquiry", () => {
  it("stores before notifying and reports receipt after notification succeeds", async () => {
    const calls: string[] = [];
    create.mockImplementation(async () => { calls.push("store"); return { id: "inquiry-1", ...input, source: "contact-form" }; });
    sendInquiryNotification.mockImplementation(async () => { calls.push("notify"); return { delivered: true }; });

    await expect(submitInquiry(input, { clientIdentity: "client-1" })).resolves.toMatchObject({ accepted: true, notificationStatus: "SENT" });
    expect(calls).toEqual(["store", "notify"]);
  });

  it("keeps the stored inquiry when notification fails and records failure metadata", async () => {
    sendInquiryNotification.mockRejectedValue(new Error("SES unavailable"));

    await expect(submitInquiry(input, { clientIdentity: "client-1" })).resolves.toMatchObject({ accepted: true, notificationStatus: "FAILED" });
    expect(updateNotificationStatus).toHaveBeenCalledWith("inquiry-1", "FAILED", "SES unavailable");
  });

  it("rate-limits repeated submissions from one client", async () => {
    await submitInquiry(input, { clientIdentity: "client-1" });
    await submitInquiry(input, { clientIdentity: "client-1" });
    await submitInquiry(input, { clientIdentity: "client-1" });

    await expect(submitInquiry(input, { clientIdentity: "client-1" })).rejects.toBeInstanceOf(RateLimitError);
    expect(create).toHaveBeenCalledTimes(3);
  });
});


it("logs notification failures without logging the inquiry message", async () => {
  const log = vi.spyOn(logger, "error").mockImplementation(() => undefined);
  sendInquiryNotification.mockRejectedValue(new Error("SES unavailable"));

  await submitInquiry(input, { clientIdentity: "client-1", requestId: "req-1" });

  expect(log).toHaveBeenCalledWith("inquiry_notification_failed", expect.objectContaining({ inquiryId: "inquiry-1", requestId: "req-1" }));
  expect(JSON.stringify(log.mock.calls)).not.toContain(input.message);
  log.mockRestore();
});
