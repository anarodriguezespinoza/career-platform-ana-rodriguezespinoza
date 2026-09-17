import { describe, expect, it } from "vitest";

import { ContactInputError, validateContactInput } from "../../src/domain/inquiries/validation";

describe("validateContactInput", () => {
  it("normalizes safe display fields and accepts a valid opportunity type", () => {
    expect(validateContactInput({
      name: "  Ana   Visitor ",
      email: " VISITOR@Example.COM ",
      message: "  I would like to discuss a project.  ",
      opportunityType: "PROJECT",
    })).toEqual({
      name: "Ana Visitor",
      email: "visitor@example.com",
      message: "I would like to discuss a project.",
      opportunityType: "PROJECT",
    });
  });

  it("rejects malformed addresses, invalid opportunity types, and oversized messages", () => {
    expect(() => validateContactInput({ name: "Visitor", email: "bad", message: "Hello", opportunityType: "PROJECT" })).toThrow(ContactInputError);
    expect(() => validateContactInput({ name: "Visitor", email: "visitor@example.com", message: "Hello", opportunityType: "INVALID" })).toThrow(ContactInputError);
    expect(() => validateContactInput({ name: "Visitor", email: "visitor@example.com", message: "x".repeat(5001), opportunityType: "PROJECT" })).toThrow(ContactInputError);
  });
});
