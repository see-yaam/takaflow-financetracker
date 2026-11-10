import { expect, test } from "@playwright/test";
import { login, requireAccount, stamp } from "./helpers";

test("landing page and login form load", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/TakaFlow/i);
  await page.goto("/login");
  await expect(page.locator("#login-email")).toBeVisible();
});

test.describe("authenticated", () => {
  test.beforeEach(async ({ page }) => {
    requireAccount();
    await login(page);
  });

  test("create a wallet", async ({ page }) => {
    const name = stamp("wallet").slice(0, 30);
    await page.goto("/settings");
    await page.getByPlaceholder(/wallet name/i).first().fill(name);
    await page.getByRole("button", { name: /add|create/i }).first().click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 20_000 });
  });

  test("add then reverse a transaction from the ledger", async ({ page }) => {
    const note = stamp("expense");
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /expense/i }).first().click();
    await page.getByPlaceholder("0.00").fill("12");
    await page.getByPlaceholder(/details|merchant/i).fill(note);
    await page.getByRole("button", { name: /commit|save|add/i }).last().click();
    await page.goto("/transactions");
    await page.getByLabel("Search transactions").fill(note);
    await expect(page.getByText("1 transaction")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("checkbox", { name: /^Select / }).first().check();
    await page.getByRole("button", { name: /reverse/i }).click();
    await page.getByRole("button", { name: /^reverse$/i }).last().click();
    await expect(page.getByText(/Reversed: 1/)).toBeVisible({ timeout: 20_000 });
  });

  test("offline expense is queued, then syncs when back online", async ({ page, context }) => {
    const note = stamp("offline");
    await page.goto("/dashboard");
    await context.setOffline(true);
    await page.getByRole("button", { name: /expense/i }).first().click();
    await page.getByPlaceholder("0.00").fill("7");
    await page.getByPlaceholder(/details|merchant/i).fill(note);
    await page.getByRole("button", { name: /commit|save|add/i }).last().click();
    await expect(page.getByText(/1 pending/).first()).toBeVisible({ timeout: 20_000 });
    await context.setOffline(false);
    await expect(page.getByText(/1 pending/)).toHaveCount(0, { timeout: 45_000 });
  });

  test("log out", async ({ page }) => {
    await page.goto("/profile");
    await page.getByRole("button", { name: /sign out|log out/i }).first().click();
    await page.getByRole("button", { name: /^sign out$/i }).last().click();
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  });
});
