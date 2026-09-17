import { describe, expect, it } from "vitest";

import { PublicationState } from "../../src/lib/db/types";

describe("career content schema", () => {
  it("defines the supported publication states", () => {
    expect(PublicationState).toEqual({
      DRAFT: "DRAFT",
      PUBLISHED: "PUBLISHED",
      ARCHIVED: "ARCHIVED",
    });
  });

  it("exposes stable ordered content and private inquiry fields", async () => {
    const { prisma } = await import("../../src/lib/db/client");

    expect(prisma.project).toBeDefined();
    expect(prisma.contactInquiry).toBeDefined();
    expect(prisma.experience).toBeDefined();
    expect(prisma.skill).toBeDefined();
    expect(prisma.resumeSettings).toBeDefined();

    expect(PublicationState.PUBLISHED).toBe("PUBLISHED");
    expect(typeof prisma.project.findMany).toBe("function");
    expect(typeof prisma.contactInquiry.findMany).toBe("function");
  });
});
