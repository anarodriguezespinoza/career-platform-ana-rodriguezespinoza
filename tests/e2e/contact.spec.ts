import { test, expect } from "@playwright/test";
import { signInAsAdmin, uniqueInquiryMessage } from "./support";

test.describe("contact inquiry workflow", () => {
  test("submits a contact inquiry with user-visible confirmation", async ({ page }) => {
    const message = uniqueInquiryMessage();
    await page.goto("/contact");
    await page.getByLabel("Name").fill("Playwright Visitor");
    await page.getByLabel("Email").fill("playwright@example.com");
    await page.getByLabel("What brings you here?").selectOption("PROJECT");
    await page.getByLabel("Message").fill(message);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Thanks. Your message has been received.",
      { timeout: 30_000 },
    );
  });

  test("allows an admin to view, update, and delete an inquiry", async ({ page }) => {
    const message = uniqueInquiryMessage();
    const response = await page.request.post("/api/contact", {
      data: {
        name: "Playwright Admin Flow",
        email: "playwright-admin@example.com",
        opportunityType: "COLLABORATION",
        message,
      },
    });
    expect(response.ok()).toBeTruthy();

    await signInAsAdmin(page);
    await page.getByRole("link", { name: "Inquiries" }).click();
    await page.getByRole("link", { name: "Playwright Admin Flow" }).click();
    await expect(page.getByText(message)).toBeVisible();

    await page.getByLabel("Status").selectOption("IN_PROGRESS");
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.getByLabel("Status")).toHaveValue("IN_PROGRESS");

    await page.getByLabel("Private notes").fill("Reviewed by Playwright release gate");
    await page.getByRole("button", { name: "Save notes" }).click();
    await expect(page.getByLabel("Private notes")).toHaveValue(
      "Reviewed by Playwright release gate",
    );

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete inquiry" }).click();
    await expect(page).toHaveURL(/\/admin\/inquiries\/?$/);
    await expect(page.getByText("Playwright Admin Flow")).not.toBeVisible();
  });
});
