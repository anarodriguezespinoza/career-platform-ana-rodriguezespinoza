import { test, expect } from "@playwright/test";
import snapshotFixture from "./fixtures/public-content.json";

const fallbackBaseURL = process.env.E2E_FALLBACK_BASE_URL;

test.describe("public snapshot fallback", () => {
  test("serves the published snapshot when live content is unavailable", async ({ page }) => {
    test.skip(
      !fallbackBaseURL,
      "Set E2E_FALLBACK_BASE_URL to a development deployment with live database reads disabled and a published snapshot configured.",
    );

    await page.goto(new URL("/", fallbackBaseURL).toString());
    await expect(page.getByRole("status")).toHaveText(
      "Showing the latest published information while live updates are temporarily unavailable.",
    );
    await expect(
      page.getByRole("heading", { name: snapshotFixture.content.profile.name }),
    ).toBeVisible();
  });
});
