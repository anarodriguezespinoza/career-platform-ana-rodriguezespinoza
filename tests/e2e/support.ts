import { expect, type Page } from "@playwright/test";

export const adminCredentials = {
  email: process.env.E2E_ADMIN_EMAIL,
  password: process.env.E2E_ADMIN_PASSWORD,
};

export const hasAdminCredentials = Boolean(
  adminCredentials.email && adminCredentials.password,
);

export async function signInAsAdmin(page: Page) {
  if (!hasAdminCredentials) {
    throw new Error(
      "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required for admin scenarios",
    );
  }

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(adminCredentials.email!);
  await page.getByLabel("Password").fill(adminCredentials.password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin(?:\/)?$/);
}

export function uniqueInquiryMessage() {
  return `Playwright release-gate inquiry ${Date.now()}`;
}
