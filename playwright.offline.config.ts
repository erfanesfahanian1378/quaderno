import { defineConfig, devices } from "@playwright/test";

/**
 * The offline suite, against a PRODUCTION build.
 *
 * Separate from the main config because it cannot share it. `next dev` serves
 * CSS and chunks from urls carrying a changing `?v=` query string, so nothing
 * cache-first ever hits and offline looks far more broken than it is — a whole
 * afternoon was lost to that during development. The main config still runs
 * against dev because `/dev/tokens`, which the smoke tests use, is a 404 in
 * production.
 *
 *   pnpm test:offline
 */
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /offline\.spec\.ts/,
  globalSetup: "./tests/e2e/offline.setup.ts",

  fullyParallel: false,
  // Service workers and Cache Storage are per-origin, and parallel workers
  // fighting over one origin's cache is a source of failures that say nothing.
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: `pnpm build && npx next start -p ${PORT}`,
    url: `${BASE_URL}/offline.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
