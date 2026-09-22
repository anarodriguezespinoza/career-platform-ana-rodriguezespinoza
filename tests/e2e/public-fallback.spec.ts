import { test, expect } from "@playwright/test";
import snapshotFixture from "./fixtures/public-content.json";
import { requireFallbackBaseURL } from "./support";

test.describe("public snapshot fallback", () => {
  test("serves the published snapshot when live content is unavailable", async ({ page }) => {
    const fallbackBaseURL = requireFallbackBaseURL();

    await page.goto(new URL("/", fallbackBaseURL).toString());
    await expect(page.getByRole("status")).toHaveText(
      "Showing the latest published information while live updates are temporarily unavailable.",
    );
    await expect(
      page.getByRole("heading", { name: snapshotFixture.content.profile.name }),
    ).toBeVisible();
  });
});
