import { expect, type Page } from "@playwright/test";

export const adminCredentials = {
  email: process.env.E2E_ADMIN_EMAIL,
  password: process.env.E2E_ADMIN_PASSWORD,
};

export function requireAdminCredentials(): { email: string; password: string } {
  if (!adminCredentials.email || !adminCredentials.password) {
    throw new Error(
      "Release E2E prerequisites missing: set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD.",
    );
  }

  return { email: adminCredentials.email, password: adminCredentials.password };
}

export function requireFallbackBaseURL(): string {
  const fallbackBaseURL = process.env.E2E_FALLBACK_BASE_URL;
  if (!fallbackBaseURL) {
    throw new Error(
      "Release E2E prerequisites missing: set E2E_FALLBACK_BASE_URL to a configured fallback deployment.",
    );
  }

  return fallbackBaseURL;
}

export async function signInAsAdmin(page: Page) {
  const credentials = requireAdminCredentials();

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin(?:\/)?$/);
}

export function uniqueInquiryMessage() {
  return `Playwright release-gate inquiry ${Date.now()}`;
}
