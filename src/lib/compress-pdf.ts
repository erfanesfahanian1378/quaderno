"use client";

import type * as PdfJs from "pdfjs-dist";

/**
 * Making an oversized PDF small enough to upload, in the browser.
 *
 * It happens here rather than on the server for the obvious reason: the file
 * is too big to upload, so there is nothing on the server to compress. The
 * bytes only exist on the reader's machine.
 *
 * **This rasterises.** Every page is re-drawn to a canvas and re-encoded as a
 * JPEG, so a PDF that had selectable text comes out as pictures of text. That
 * is a real loss and the UI says so plainly — but it is also the only thing
 * that helps, because what makes a 200 MB handout 200 MB is scanned page
 * images at 600 DPI, and no lossless re-save touches those. OCR can put a text
 * layer back afterwards, which is why that feature exists.
 *
 * A PDF that is huge for some other reason (thousands of vector objects) will
 * barely shrink, and the caller is told the before and after so the reader can
 * decide rather than be surprised.
 */

export type CompressResult = {
  file: File;
  originalBytes: number;
  bytes: number;
  pages: number;
  /** How far it had to degrade quality to fit, for the report. */
  scale: number;
  quality: number;
};

export type CompressProgress = {
  page: number;
  pages: number;
  /** Which attempt, when the first pass was not small enough. */
  attempt: number;
};

/**
 * Successively harder settings.
 *
 * `scale` is relative to the PDF's own page size at 72 DPI, so 2.0 is roughly
 * 144 DPI — comfortably readable on screen and when printed. The last entry is
 * deliberately poor: at that point the alternative is not uploading at all.
 */
const ATTEMPTS = [
  { scale: 2.0, quality: 0.72 },
  { scale: 1.6, quality: 0.62 },
  { scale: 1.25, quality: 0.55 },
  { scale: 1.0, quality: 0.45 },
] as const;

let workerConfigured = false;

async function loadPdfJs(): Promise<typeof PdfJs> {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    // Same-origin worker, as the CSP requires — see usePdfDocument.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    workerConfigured = true;
  }
  return pdfjs;
}

export function canCompress(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export async function compressPdf(
  file: File,
  options: {
    /** Stop as soon as the result is under this. */
    targetBytes: number;
    onProgress?: (progress: CompressProgress) => void;
    signal?: AbortSignal;
  },
): Promise<CompressResult> {
  const [pdfjs, { PDFDocument }] = await Promise.all([
    loadPdfJs(),
    import("pdf-lib"),
  ]);

  const source = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    // No range requests: the bytes are already here.
    disableAutoFetch: false,
  }).promise;

  const pages = source.numPages;
  let best: CompressResult | null = null;

  for (const [index, attempt] of ATTEMPTS.entries()) {
    if (options.signal?.aborted) throw new Error("Cancelled");

    const output = await PDFDocument.create();

    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      if (options.signal?.aborted) throw new Error("Cancelled");

      options.onProgress?.({ page: pageNumber, pages, attempt: index + 1 });

      const page = await source.getPage(pageNumber);
      const viewport = page.getViewport({ scale: attempt.scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));

      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");

      /*
       * White first. A PDF page has no background of its own, and a JPEG has
       * no transparency — without this, every page comes out black.
       */
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvas, canvasContext: context, viewport }).promise;

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", attempt.quality),
      );
      if (!blob) throw new Error("The page could not be encoded");

      const image = await output.embedJpg(
        new Uint8Array(await blob.arrayBuffer()),
      );

      // The page keeps its ORIGINAL point size, so the document still prints
      // at the right paper size however coarsely it was rendered.
      const target = output.addPage([
        viewport.width / attempt.scale,
        viewport.height / attempt.scale,
      ]);
      target.drawImage(image, {
        x: 0,
        y: 0,
        width: target.getWidth(),
        height: target.getHeight(),
      });

      // Free the bitmap now rather than at the next garbage collection: a
      // 300-page scan at 144 DPI is gigabytes of canvas if they accumulate.
      canvas.width = 0;
      canvas.height = 0;

      page.cleanup();
    }

    const bytes = await output.save({ useObjectStreams: true });
    const result: CompressResult = {
      file: new File([new Uint8Array(bytes)], renameForCompression(file.name), {
        type: "application/pdf",
      }),
      originalBytes: file.size,
      bytes: bytes.length,
      pages,
      scale: attempt.scale,
      quality: attempt.quality,
    };

    // Keep the best so far, so a document that never fits still returns the
    // smallest version rather than nothing.
    if (!best || result.bytes < best.bytes) best = result;
    if (result.bytes <= options.targetBytes) break;
  }

  await source.cleanup();

  if (!best) throw new Error("Nothing was produced");
  return best;
}

function renameForCompression(name: string): string {
  const base = name.replace(/\.pdf$/i, "");
  return `${base} (compressed).pdf`;
}
