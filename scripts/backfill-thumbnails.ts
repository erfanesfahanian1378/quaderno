import "dotenv/config";
import { prisma } from "../src/server/repositories/client";
import { getObjectBytes, putObject } from "../src/server/storage";
import { thumbnailKey } from "../src/server/storage/keys";
import {
  renderFirstPagePng,
  thumbnailAvailable,
} from "../worker/lib/thumbnail";

/**
 * Re-renders page-1 thumbnails.
 *
 * Every document ingested before the thumbnail was a real raster has a
 * `thumbnailKey` pointing at a single-page PDF, which an <img> cannot show.
 * This walks them and writes a PNG. Safe to re-run; it skips anything that is
 * already a .png.
 *
 *   pnpm tsx scripts/backfill-thumbnails.ts [--all]
 */
async function main() {
  if (!(await thumbnailAvailable())) {
    console.error("pdftocairo is not on PATH — install poppler first.");
    process.exitCode = 1;
    return;
  }

  const all = process.argv.includes("--all");

  const documents = await prisma.document.findMany({
    where: { deletedAt: null, status: "READY" },
    select: {
      id: true,
      userId: true,
      title: true,
      thumbnailKey: true,
      sourceFiles: { select: { pdfStorageKey: true } },
      leaves: { orderBy: { position: "asc" }, take: 1, select: { id: true } },
    },
  });

  let done = 0;
  let skipped = 0;

  for (const document of documents) {
    if (!all && document.thumbnailKey?.endsWith(".png")) {
      skipped += 1;
      continue;
    }

    const source = document.sourceFiles.find((file) => file.pdfStorageKey);
    const leafId = document.leaves[0]?.id;
    if (!source?.pdfStorageKey || !leafId) {
      skipped += 1;
      continue;
    }

    try {
      const pdf = await getObjectBytes(source.pdfStorageKey);
      const png = await renderFirstPagePng(pdf);
      if (!png) {
        console.log(`  skip  ${document.title}: nothing rendered`);
        skipped += 1;
        continue;
      }

      const key = thumbnailKey(document.userId, document.id, leafId);
      await putObject(key, png, { contentType: "image/png" });
      await prisma.document.update({
        where: { id: document.id },
        data: { thumbnailKey: key },
      });

      console.log(`  ok    ${document.title} (${png.length} bytes)`);
      done += 1;
    } catch (error) {
      console.log(`  fail  ${document.title}: ${String(error)}`);
      skipped += 1;
    }
  }

  console.log(`\n${done} rendered, ${skipped} skipped.`);
  await prisma.$disconnect();
}

void main();
