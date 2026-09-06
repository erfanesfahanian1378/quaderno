import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * E2E covers the flows that define the product, not component internals
 * (CLAUDE.md, "Testing expectations"). Phase 01 ships one smoke test; the
 * upload → convert → highlight → insert-a-note-page flow arrives with the
 * phases that build it.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // The viewer is designed for one-handed mobile use, so a phone profile is
    // not optional here — it is where the product is actually used in class.
    { name: "mobile-safari", use: { ...devices["iPhone 13"] } },
  ],

  /*
   * Dev server, not a production build, and deliberately so for now: the only
   * UI Phase 01 ships is `/dev/tokens`, which is gated behind
   * `NODE_ENV !== "production"` per the phase doc. A production build serves
   * it as a 404, so these tests would be asserting against an error page.
   *
   * `pnpm build` is still verified independently in CI. Switch this to
   * `pnpm build && pnpm start` from PHASE-03, once there are real product
   * routes to exercise and the E2E suite should be hitting production output.
   */
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
