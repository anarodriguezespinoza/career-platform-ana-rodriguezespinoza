export const opportunityTypes = ["PROJECT", "COLLABORATION", "SPEAKING", "OTHER"] as const;
export type OpportunityType = (typeof opportunityTypes)[number];

export type ContactInput = {
  name: string;
  email: string;
  message: string;
  opportunityType: OpportunityType;
};

export class ContactInputError extends Error {
  readonly status = 400;

  constructor(message = "Invalid contact input") {
    super(message);
    this.name = "ContactInputError";
  }
}

export function validateContactInput(input: unknown): ContactInput {
  if (!input || typeof input !== "object") throw new ContactInputError();
  const record = input as Record<string, unknown>;
  const name = normalizeWhitespace(record.name);
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  const message = typeof record.message === "string" ? record.message.trim() : "";
  const opportunityType = record.opportunityType;

  if (name.length < 2 || name.length > 120) throw new ContactInputError();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new ContactInputError();
  if (message.length < 1 || message.length > 5000) throw new ContactInputError();
  if (!opportunityTypes.includes(opportunityType as OpportunityType)) throw new ContactInputError();

  return { name, email, message, opportunityType: opportunityType as OpportunityType };
}

function normalizeWhitespace(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}
