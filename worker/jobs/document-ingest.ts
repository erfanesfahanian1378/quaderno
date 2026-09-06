import type PgBoss from "pg-boss";
import { PDFDocument } from "pdf-lib";
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
    const created = await leaves.createSourcePages(
      documentId,
      sourceFileId,
      probe.pageCount,
    );
    await leaves.setLeafCount(documentId, created);

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
 * The page-1 thumbnail. This is the ONLY server-side rasterisation in the
 * product (ARCHITECTURE.md §2) — keep it that way.
 *
 * pdf.js would be needed to rasterise properly, and running it in the worker
 * costs more than it is worth here, so this extracts page 1 into a
 * single-page PDF and stores it; the client renders it. If a real raster is
 * wanted later, it belongs in this one function and nowhere else.
 */
async function renderThumbnail(
  pdf: Uint8Array,
  userId: string,
  documentId: string,
  log: string[],
): Promise<void> {
  try {
    const source = await PDFDocument.load(pdf, { ignoreEncryption: true });
    const single = await PDFDocument.create();
    const [firstPage] = await single.copyPages(source, [0]);
    if (!firstPage) return;
    single.addPage(firstPage);

    const firstLeaf = await leaves.firstLeafId(documentId);
    if (!firstLeaf) return;

    await putObject(
      thumbnailKey(userId, documentId, firstLeaf).replace(/\.webp$/, ".pdf"),
      await single.save(),
      { contentType: "application/pdf" },
    );
    await documents.setThumbnailKey(
      documentId,
      thumbnailKey(userId, documentId, firstLeaf).replace(/\.webp$/, ".pdf"),
    );
    log.push("thumbnail: page 1 extracted");
  } catch (error) {
    // A missing thumbnail is a cosmetic problem; it must never fail an ingest
    // that otherwise succeeded.
    log.push(`thumbnail failed (non-fatal): ${String(error)}`);
  }
}
