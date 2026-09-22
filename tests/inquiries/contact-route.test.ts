import { beforeEach, describe, expect, it, vi } from "vitest";

const { validateContactInput, submitInquiry } = vi.hoisted(() => ({
  validateContactInput: vi.fn(),
  submitInquiry: vi.fn(),
}));
vi.mock("../../src/domain/inquiries/validation", () => ({ validateContactInput, ContactInputError: class ContactInputError extends Error {} }));
vi.mock("../../src/domain/inquiries/service", () => ({ submitInquiry }));

import { POST } from "../../src/app/api/contact/route";

beforeEach(() => {
  vi.clearAllMocks();
  validateContactInput.mockImplementation((input) => input);
  submitInquiry.mockResolvedValue({ accepted: true, notificationStatus: "SENT" });
});

describe("POST /api/contact", () => {
  it("returns a generic receipt response for a valid submission", async () => {
    const response = await POST(new Request("https://example.com/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
      body: JSON.stringify({ name: "Visitor", email: "visitor@example.com", message: "Hello", opportunityType: "PROJECT" }),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ message: "Thanks. Your message has been received." });
    expect(submitInquiry).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ clientIdentity: "203.0.113.10", requestId: expect.any(String) }));
  });

  it("returns generic public errors for invalid input and rate limits", async () => {
    validateContactInput.mockImplementation(() => { const error = new Error("invalid"); error.name = "ContactInputError"; throw error; });
    const invalid = await POST(new Request("https://example.com/api/contact", { method: "POST", body: "{}" }));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ message: "Please check your details and try again." });

    validateContactInput.mockImplementation((input) => input);
    const rateLimited = new Error("too many");
    rateLimited.name = "RateLimitError";
    Object.assign(rateLimited, { retryAfterSeconds: 60 });
    submitInquiry.mockRejectedValue(rateLimited);
    const response = await POST(new Request("https://example.com/api/contact", { method: "POST", body: "{}" }));
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ message: "Please wait before sending another message." });
    expect(response.headers.get("retry-after")).toBe("60");
  });
});
