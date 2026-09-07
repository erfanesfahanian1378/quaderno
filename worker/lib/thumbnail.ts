import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isAvailable, run } from "./run";

/**
 * The page-1 thumbnail, as a real raster.
 *
 * This is the ONLY server-side rasterisation in the product
 * (ARCHITECTURE.md §2). It stays that way — everything else renders in the
 * browser with pdf.js.
 *
 * It used to store page 1 as a single-page PDF instead, on the reasoning that
 * the client could render it. The client shows it in an `<img>`, which cannot
 * render a PDF, so the tile was broken for every document ever uploaded. The
 * alternative — pulling a range of every PDF in the library through pdf.js to
 * draw twenty tiles — is far more expensive than one 30 KB PNG made once at
 * ingest.
 *
 * pdftocairo comes from poppler, which ocrmypdf already depends on, so this
 * adds no new install. If it is missing the caller skips the thumbnail and
 * the tile shows a file icon, which is honest.
 */

/** 4:3 tiles at 2x on a phone. Wider than this is wasted bytes. */
const WIDTH_PX = 480;

export async function thumbnailAvailable(): Promise<boolean> {
  return isAvailable("pdftocairo");
}

export async function renderFirstPagePng(
  pdf: Uint8Array,
): Promise<Uint8Array | null> {
  if (!(await thumbnailAvailable())) return null;

  const dir = await mkdtemp(join(tmpdir(), "quaderno-thumb-"));
  try {
    const input = join(dir, "in.pdf");
    await writeFile(input, pdf);

    // `-singlefile` makes the output exactly `out.png` rather than
    // `out-1.png`, which is the difference between reading the file and
    // guessing at its name.
    const result = await run(
      "pdftocairo",
      [
        "-png",
        "-singlefile",
        "-f",
        "1",
        "-l",
        "1",
        "-scale-to-x",
        String(WIDTH_PX),
        // -1 keeps the aspect ratio rather than forcing a square.
        "-scale-to-y",
        "-1",
        input,
        join(dir, "out"),
      ],
      { timeoutMs: 20_000, nice: 10 },
    );

    if (result.code !== 0) return null;
    return new Uint8Array(await readFile(join(dir, "out.png")));
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
