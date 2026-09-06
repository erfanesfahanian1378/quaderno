import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * `.mts` on purpose: the config is loaded as ESM, and both this file's plugins
 * are ESM-only. A plain `vitest.config.ts` in a package without
 * `"type": "module"` is bundled to CJS and fails to require them.
 *
 * jsdom is the default because most tests are pure logic or components.
 * Integration tests that need real I/O opt into node with a docblock:
 *
 *     // @vitest-environment node
 *
 * That keeps the environment next to the test that needs it, rather than in a
 * glob here that drifts as directories move.
 */
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  /*
   * Tests never render real CSS, and Vite cannot read postcss.config.mjs —
   * that file uses Next's string-plugin form ("@tailwindcss/postcss"), which
   * is a Next convention, not a PostCSS one. Emptying the pipeline here keeps
   * one config file valid for both tools.
   */
  css: { postcss: { plugins: [] } },
  test: {
    css: false,
    globals: true,
    environment: "jsdom",
    env: { VITEST: "true" },
    setupFiles: ["tests/setup/unit.ts"],
    include: [
      "tests/unit/**/*.spec.{ts,tsx}",
      "tests/integration/**/*.spec.ts",
      "tests/security/**/*.spec.ts",
    ],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/server/**", "src/lib/**", "src/components/viewer/**"],
    },
  },
});
