import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "prisma/migrations/20260917214047_publish_resume_settings/migration.sql";
const seedPath = "prisma/seed.ts";

describe("resume settings upgrade path", () => {
  it("preserves the seeded public state when adding publicationState", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toMatch(
      /INSERT INTO "new_ResumeSettings"[\s\S]*"publicationState"[\s\S]*SELECT[\s\S]*['"]PUBLISHED['"] AS "publicationState"[\s\S]*FROM "ResumeSettings"/,
    );
  });

  it("repairs an existing seeded row to published during seeding", () => {
    const seed = readFileSync(seedPath, "utf8");
    const resumeSettingsUpsert = seed.slice(seed.indexOf("resumeSettings.upsert"));

    expect(resumeSettingsUpsert).toMatch(/where:\s*\{ id: "resume-settings-default" \},\s*update:\s*\{\s*publicationState: "PUBLISHED"\s*\}/);
  });
});
