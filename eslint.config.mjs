import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { FlatCompat } from "@eslint/eslintrc";
import prettier from "eslint-config-prettier";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

/**
 * The Prisma import ban is HARD RULE #1 in CLAUDE.md: `@prisma/client` may be
 * imported only under `src/server/repositories/**`. It is expressed as a
 * global restriction plus a narrow allow-list override below.
 */
const PRISMA_BAN = {
  "no-restricted-imports": [
    "error",
    {
      paths: [
        {
          name: "@prisma/client",
          message:
            "Prisma may only be imported in src/server/repositories/**. Services take repositories as arguments; route handlers call services. See CLAUDE.md rule 1.",
        },
        {
          name: ".prisma/client",
          message:
            "Prisma may only be imported in src/server/repositories/**. See CLAUDE.md rule 1.",
        },
      ],
      patterns: [
        {
          group: ["@prisma/client/*", "**/prisma/client"],
          message:
            "Prisma may only be imported in src/server/repositories/**. See CLAUDE.md rule 1.",
        },
      ],
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "dist/**",
      "next-env.d.ts",
      "prisma/migrations/**",
      "public/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...compat.extends("next/core-web-vitals"),
  {
    /*
     * Typed linting. It costs a few seconds in CI and buys the two rules that
     * catch real bugs rather than style: no-floating-promises (an un-awaited
     * transaction is a data-loss bug, and this app runs several) and
     * no-misused-promises (an async function passed where void is expected —
     * the classic silent React event-handler failure).
     *
     * The parser is set explicitly because eslint-config-next installs its
     * own, which does not forward parserOptions to @typescript-eslint/parser.
     */
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: {
          // Config files live outside tsconfig's include; lint them with the
          // default project rather than failing to resolve them.
          // Only the .mjs files, which tsconfig does not include. Anything
          // tsconfig DOES include must not be listed here as well.
          allowDefaultProject: ["*.mjs", "scripts/*.mjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...PRISMA_BAN,
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // CLAUDE.md rule 6: no `any`.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // The one place Prisma is allowed. Also the seed script, the worker's own
    // data access, and migration tooling.
    files: [
      "src/server/repositories/**/*.ts",
      "prisma/**/*.ts",
      "worker/**/*.ts",
      "tests/**/*.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["worker/**/*.ts", "prisma/**/*.ts", "scripts/**/*.ts"],
    rules: { "no-console": "off" },
  },
  prettier,
);
