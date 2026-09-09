/**
 * Write the list of build assets the service worker must cache up front.
 *
 * The offline layer used to cache a page only after someone had visited it
 * online. That is fine for a page you return to and useless for the case that
 * actually matters: opening the app in a tunnel and tapping a link you have
 * not tapped before. The HTML could be fetched ahead of time — but Next serves
 * a page as HTML *plus* a graph of hashed JavaScript chunks, and a page whose
 * chunks are missing does not render, it throws ChunkLoadError.
 *
 * Those filenames are only known after a build. So the build writes them here
 * and the worker reads them at install, which is the only point where the two
 * can agree.
 *
 * Source maps are excluded deliberately: they are often larger than the code
 * and no reader has ever needed one.
 */
import { createHash } from "node:crypto";
import { readdir, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const DIST = process.env.NEXT_DIST_DIR ?? ".next";
const ROOT = process.cwd();
const STATIC = join(ROOT, DIST, "static");
const OUT = join(ROOT, "public", "precache.json");

/**
 * Files under /public worth having before they are asked for.
 *
 * The pdf.js worker is the one that matters — without it a cached document
 * opens to a blank page, which is the most confusing possible failure: the
 * app works, the file is there, and nothing renders.
 */
const PUBLIC_ASSETS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/pdf.worker.min.mjs",
];

async function walk(dir) {
  const found = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found; // No build output. The worker copes with an empty list.
  }

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walk(path)));
      continue;
    }
    if (entry.name.endsWith(".map")) continue;
    found.push(path);
  }

  return found;
}

const files = await walk(STATIC);

const assets = [];
let bytes = 0;

for (const file of files) {
  const info = await stat(file);
  bytes += info.size;
  assets.push(`/_next/static/${relative(STATIC, file).split("\\").join("/")}`);
}

for (const asset of PUBLIC_ASSETS) {
  try {
    const info = await stat(join(ROOT, "public", asset));
    bytes += info.size;
    assets.push(asset);
  } catch {
    // An optional asset that is not in this build. Not worth failing over.
  }
}

assets.sort();

/*
 * A content hash, not the Next build id.
 *
 * The worker uses this to decide whether its cache is stale. Deriving it from
 * the asset list means a rebuild that changes nothing — which happens on every
 * redeploy of an unchanged commit — does not throw away a reader's whole cache
 * and make them download it again over whatever connection they have.
 */
const version = createHash("sha256")
  .update(assets.join("\n"))
  .digest("hex")
  .slice(0, 12);

await writeFile(
  OUT,
  `${JSON.stringify({ version, bytes, assets }, null, 2)}\n`,
  "utf8",
);

const mb = (bytes / 1024 / 1024).toFixed(1);
console.log(`precache: ${assets.length} assets, ${mb} MB, version ${version}`);
