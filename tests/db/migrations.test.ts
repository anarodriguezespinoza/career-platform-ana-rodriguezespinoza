import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "prisma/migrations/20260917214047_publish_resume_settings/migration.sql";
const seedPath = "prisma/seed.ts";

describe("resume settings upgrade path", () => {
  it("adds publicationState with the schema default before backfill", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain('"publicationState" TEXT NOT NULL DEFAULT \'DRAFT\'');
    expect(migration).toContain(
      'INSERT INTO "new_ResumeSettings" ("id", "intro", "resumeUrl", "title", "updatedAt")',
    );
  });

  it("repairs an existing seeded row to published during seeding", () => {
    const seed = readFileSync(seedPath, "utf8");
    const resumeSettingsUpsert = seed.slice(seed.indexOf("resumeSettings.upsert"));

    expect(resumeSettingsUpsert).toMatch(
      /where:\s*\{ id: "resume-settings-default" \},\s*update:\s*\{\s*publicationState: "PUBLISHED"\s*\}/,
    );
  });

  it("keeps the schema migration immutable and uses a follow-up backfill", () => {
    const backfillMigration = readFileSync(
      "prisma/migrations/20260917214400_publish_existing_resume_settings/migration.sql",
      "utf8",
    );

    expect(backfillMigration).toContain('UPDATE "ResumeSettings"');
    expect(backfillMigration).toContain('"publicationState" = \'PUBLISHED\'');
  });
});
