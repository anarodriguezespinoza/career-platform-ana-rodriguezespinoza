import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const amplifyConfig = readFileSync(new URL("../../amplify.yml", import.meta.url), "utf8");

describe("Amplify deployment policy", () => {
  it("runs Prisma migrations only for an explicit release environment and branch", () => {
    expect(amplifyConfig).toContain('RUN_PRISMA_MIGRATIONS:-false');
    expect(amplifyConfig).toContain('RELEASE_ENVIRONMENT');
    expect(amplifyConfig).toContain('RELEASE_BRANCH');
    expect(amplifyConfig).toContain('AWS_BRANCH');
    expect(amplifyConfig).toMatch(/RUN_PRISMA_MIGRATIONS[^\n]+true/);
    expect(amplifyConfig).toContain("npx prisma migrate deploy");
  });

  it("does not run migrations as an unconditional build command", () => {
    const migrationLine = amplifyConfig.split("\n").find((line) => line.includes("prisma migrate deploy"));
    expect(migrationLine).toMatch(/^\s+- if \[/);
  });
});
