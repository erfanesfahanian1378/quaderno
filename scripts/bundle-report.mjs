#!/usr/bin/env node
/**
 * Bundle budget report.
 *
 * ARCHITECTURE.md §6 sets a hard ceiling: the viewer route may not exceed
 * 250 KB gzipped of first-load JS, excluding pdf.js (lazy-loaded and cached
 * separately). PHASE-09 turns this into a build failure. Until the viewer
 * exists, it reports every route so the trend is visible from the start —
 * a budget introduced at the end is a budget you blow.
 */
import { gzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BUDGETS = [{ route: "/d/", label: "viewer", maxGzipBytes: 250 * 1024 }];

const APP_BUILD_MANIFEST = ".next/app-build-manifest.json";

function gzipBytes(path) {
  try {
    return gzipSync(readFileSync(path)).length;
  } catch {
    return 0;
  }
}

function main() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(APP_BUILD_MANIFEST, "utf8"));
  } catch {
    console.error(`No ${APP_BUILD_MANIFEST}. Run \`pnpm build\` first.`);
    process.exit(0);
  }

  const rows = [];
  for (const [route, files] of Object.entries(manifest.pages ?? {})) {
    const js = files.filter((file) => file.endsWith(".js"));
    const total = js.reduce(
      (sum, file) => sum + gzipBytes(join(".next", file)),
      0,
    );
    rows.push({ route, files: js.length, gzipBytes: total });
  }

  rows.sort((a, b) => b.gzipBytes - a.gzipBytes);

  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
  console.log("\nFirst-load JS, gzipped\n");
  for (const row of rows) {
    console.log(`  ${kb(row.gzipBytes).padStart(10)}  ${row.route}`);
  }

  let failed = false;
  for (const budget of BUDGETS) {
    const matched = rows.filter((row) => row.route.includes(budget.route));
    for (const row of matched) {
      const over = row.gzipBytes > budget.maxGzipBytes;
      console.log(
        `\n  budget ${budget.label}: ${kb(row.gzipBytes)} / ${kb(budget.maxGzipBytes)} ${over ? "OVER" : "ok"}`,
      );
      if (over) failed = true;
    }
    if (matched.length === 0) {
      console.log(
        `\n  budget ${budget.label}: route not built yet (arrives in PHASE-05)`,
      );
    }
  }

  writeFileSync(
    "bundle-report.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2),
  );
  console.log("\nWrote bundle-report.json\n");

  // PHASE-09 flips this to process.exit(failed ? 1 : 0).
  if (failed) console.warn("Bundle budget exceeded (advisory until PHASE-09).");
}

main();
