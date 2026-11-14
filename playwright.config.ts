import { defineConfig, devices } from "@playwright/test";

/**
 * P3-04 E2E smoke tests. They run against a local production preview
 * (`npm run build && npm run preview`) or E2E_BASE_URL, and need a dedicated
 * test account: E2E_EMAIL / E2E_PASSWORD. Without credentials the authenticated
 * specs are skipped.
 */
const baseURL = process.env.E2E_BASE_URL || "http://localhost:4173";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure", ...devices["Pixel 7"] },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run build && npm run preview -- --port 4173", url: baseURL, reuseExistingServer: true, timeout: 180_000 },
});
