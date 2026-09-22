import { test, expect } from "@playwright/test";
import { signInAsAdmin } from "./support";

test.describe("admin draft and publishing workflow", () => {
  test("signs in, previews a draft, publishes it, and shows the public result", async ({ page }) => {
    await signInAsAdmin(page);

    await page.getByRole("link", { name: "Content" }).click();
    await page.getByRole("link", { name: /profile-ana/ }).click();
    const name = page.getByLabel("name");
    await name.fill(`Ana Rodriguez E2E ${Date.now()}`);
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status")).toHaveText("Draft saved");

    await page.getByRole("link", { name: "Preview" }).click();
    await expect(page.getByRole("heading", { name: "Draft preview" })).toBeVisible();
    await expect(page.getByText(/Ana Rodriguez E2E/)).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Ana Rodriguez E2E/ })).not.toBeVisible();

    await page.goto("/admin");
    await page.getByRole("button", { name: "Publish all drafts" }).click();
    await expect(page.getByRole("status")).toHaveText("Published");

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Ana Rodriguez E2E/ })).toBeVisible();
  });
});
