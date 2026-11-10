import { expect, Page, test } from "@playwright/test";

export const E2E_EMAIL = process.env.E2E_EMAIL;
export const E2E_PASSWORD = process.env.E2E_PASSWORD;

/** Skips the calling spec unless a dedicated test account is configured. */
export function requireAccount() {
  test.skip(!E2E_EMAIL || !E2E_PASSWORD, "Set E2E_EMAIL and E2E_PASSWORD for a dedicated test account");
}

export async function login(page: Page) {
  await page.goto("/login");
  await page.locator("#login-email").fill(E2E_EMAIL as string);
  await page.locator("#login-password").fill(E2E_PASSWORD as string);
  await page.getByRole("button", { name: /sign in|log in|unlock/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 30_000 });
}

/** Unique note so specs never collide with real data. */
export const stamp = (label: string) => `e2e ${label} ${Date.now()}`;
