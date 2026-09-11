import type PgBoss from "pg-boss";
import { QUEUES } from "../queue";
import {
  ConversionError,
  convertImage,
  convertText,
  convertWithLibreOffice,
  probePdf,
  repairPdf,
} from "../lib/convert";
import * as sourceFiles from "../../src/server/repositories/source-file";
import * as documents from "../../src/server/repositories/document";
import * as leaves from "../../src/server/repositories/leaf";
import { getObjectBytes, putObject } from "../../src/server/storage";
import { normalisedPdfKey, thumbnailKey } from "../../src/server/storage/keys";
import { renderFirstPagePng, thumbnailAvailable } from "../lib/thumbnail";
import {
  detectKind,
  conversionEngineFor,
  extensionFor,
} from "../../src/server/services/ingest/detect";

/**
 * The ingest pipeline, ARCHITECTURE.md §3.
 *
 *   store original -> detect -> convert to PDF -> probe -> create leaves ->
 *   thumbnail -> READY
 *
 * **Conversion concurrency is 1 and is not a tuning knob.** LibreOffice bursts
 * to ~350 MB and the target box has 2 GB total; two at once is how the OOM
 * killer takes down Postgres.
 */

export type IngestPayload = {
  sourceFileId: string;
  documentId: string;
  userId: string;
};

export async function registerIngest(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUES.documentIngest);

  await boss.work<IngestPayload>(
    QUEUES.documentIngest,
    {
      batchSize: 1,
      // The whole point. See above.
      pollingIntervalSeconds: 2,
    },
    async ([job]) => {
      if (!job) return;
      await ingest(job.data);
    },
  );
}

export async function ingest(payload: IngestPayload): Promise<void> {
  const { sourceFileId, documentId, userId } = payload;
  const timeoutMs = Number(process.env.WORKER_CONVERT_TIMEOUT_MS ?? 120_000);
  const log: string[] = [];

  const record = await sourceFiles.forJob(sourceFileId);
  if (!record) {
    console.warn(`[ingest] source file ${sourceFileId} vanished; skipping`);
    return;
  }

  try {
    log.push(`ingest start: ${record.originalName} (${record.mimeType})`);
    const original = await getObjectBytes(record.storageKey);

    const kind = detectKind(original.slice(0, 512), record.mimeType);
    if (!kind) {
      throw new ConversionError(
        "That file is not the type it claims to be, so we did not open it.",
        log,
      );
    }

    const engine = conversionEngineFor(kind);
    log.push(`detected ${kind}, engine ${engine}`);

    const outcome =
      engine === "pdf-repair"
        ? await repairPdf(original, timeoutMs)
        : engine === "libreoffice"
          ? await convertWithLibreOffice(
              original,
              extensionFor(kind),
              timeoutMs,
            )
          : engine === "img2pdf"
            ? await convertImage(
                original,
                kind as "png" | "jpeg" | "webp" | "heic",
              )
            : await convertText(original, kind === "md");

    log.push(...outcome.log);

    const probe = await probePdf(outcome.pdf);
    log.push(
      `probe: ${probe.pageCount} pages, text layer ${probe.hasTextLayer ? "present" : "absent"}`,
    );

    if (probe.pageCount === 0) {
      throw new ConversionError(
        "That file converted to an empty document.",
        log,
      );
    }

    // The normalised PDF is a DERIVED artefact with its own key. The original
    // is never touched (CLAUDE.md rule 8).
    const pdfKey = normalisedPdfKey(userId, documentId, sourceFileId);
    await putObject(pdfKey, outcome.pdf, { contentType: "application/pdf" });

    await sourceFiles.recordConversion(sourceFileId, {
      pdfStorageKey: pdfKey,
      pdfPageCount: probe.pageCount,
      pdfByteSize: BigInt(outcome.pdf.byteLength),
      conversionEngine: outcome.engine,
      conversionMs: outcome.ms,
      hasTextLayer: probe.hasTextLayer,
      conversionLog: log.join("\n"),
    });

    // One SOURCE_PAGE leaf per PDF page, then READY — in that order, so a
    // client that sees READY always finds pages behind it.
    await leaves.createSourcePages(documentId, sourceFileId, probe.pageCount);

    // Recounted, not assumed: on a retry the document may already carry note
    // pages that the number of source pages knows nothing about, and one of
    // them may be hidden. See recountLeaves.
    await leaves.recountLeaves(documentId);

    await renderThumbnail(outcome.pdf, userId, documentId, log);

    await documents.setStatus(documentId, "READY");
    log.push("READY");
    await sourceFiles.appendLog(sourceFileId, log.join("\n"));

    console.log(
      `[ingest] ${documentId} ready: ${probe.pageCount} pages via ${outcome.engine} in ${outcome.ms}ms`,
    );
  } catch (error) {
    const message =
      error instanceof ConversionError
        ? error.message
        : "Something went wrong converting that file. The original is still saved and downloadable.";

    if (error instanceof ConversionError) log.push(...error.log);
    log.push(`FAILED: ${message}`);

    await documents.setStatus(documentId, "FAILED");
    await sourceFiles.appendLog(sourceFileId, log.join("\n"));

    console.error(`[ingest] ${documentId} failed:`, error);
    // Rethrow so pg-boss records the failure and retries transient errors.
    throw error;
  }
}

/**
 * The page-1 thumbnail.
 *
 * A real PNG. The rasterisation itself lives in worker/lib/thumbnail.ts, and
 * that file explains why this is the one place in the product that rasterises
 * on the server.
 */
async function renderThumbnail(
  pdf: Uint8Array,
  userId: string,
  documentId: string,
  log: string[],
): Promise<void> {
  try {
    const firstLeaf = await leaves.firstLeafId(documentId);
    if (!firstLeaf) return;

    const png = await renderFirstPagePng(pdf);
    if (!png) {
      // Missing poppler, an encrypted PDF, a timeout. The tile falls back to
      // a file icon, which is a fair description of what we know.
      log.push(
        (await thumbnailAvailable())
          ? "thumbnail: pdftocairo produced nothing"
          : "thumbnail: pdftocairo not on PATH",
      );
      return;
    }

    const key = thumbnailKey(userId, documentId, firstLeaf);
    await putObject(key, png, { contentType: "image/png" });
    await documents.setThumbnailKey(documentId, key);
    log.push(`thumbnail: page 1 rendered (${png.length} bytes)`);
  } catch (error) {
    // A missing thumbnail is cosmetic; it must never fail an ingest that
    // otherwise succeeded.
    log.push(`thumbnail failed (non-fatal): ${String(error)}`);
  }
}
