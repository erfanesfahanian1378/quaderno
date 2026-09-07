import type PgBoss from "pg-boss";
import { QUEUES } from "../queue";
import { OcrError, ocrPdf } from "../lib/ocr";
import { probePdf } from "../lib/convert";
import * as sourceFiles from "../../src/server/repositories/source-file";
import { getObjectBytes, putObject } from "../../src/server/storage";
import { sourceFilePrefix } from "../../src/server/storage/keys";

export type OcrPayload = {
  sourceFileId: string;
  documentId: string;
  userId: string;
  languageCode: string;
};

export async function registerOcr(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUES.documentOcr);

  await boss.work<OcrPayload>(
    QUEUES.documentOcr,
    // Concurrency 1, same as conversion, and for the same reason.
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async ([job]) => {
      if (!job) return;
      await runOcr(job.data);
    },
  );
}

export async function runOcr(payload: OcrPayload): Promise<void> {
  const { sourceFileId, documentId, userId, languageCode } = payload;
  const timeoutMs = Number(process.env.WORKER_OCR_TIMEOUT_MS ?? 300_000);
  const log: string[] = [];

  const record = await sourceFiles.forJob(sourceFileId);
  if (!record?.pdfStorageKey) {
    console.warn(`[ocr] ${sourceFileId} has no PDF; skipping`);
    return;
  }

  try {
    const before = await getObjectBytes(record.pdfStorageKey);
    const beforeProbe = await probePdf(before);

    const result = await ocrPdf(before, languageCode, timeoutMs);
    log.push(...result.log);

    const afterProbe = await probePdf(result.pdf);

    /*
     * The page count must not change.
     *
     * Every Leaf.sourcePageIndex and every annotation quad depends on the
     * page geometry being identical. If ocrmypdf returned a different count,
     * something is very wrong and swapping the key would silently misplace
     * every existing mark — so keep the original.
     */
    if (afterProbe.pageCount !== beforeProbe.pageCount) {
      throw new OcrError(
        "OCR changed the page count, so it was not applied. The document is unchanged.",
        [
          ...log,
          `page count ${beforeProbe.pageCount} -> ${afterProbe.pageCount}`,
        ],
      );
    }

    // A NEW key. The pre-OCR PDF is a derived artefact too and is kept
    // (CLAUDE.md rule 8).
    const key = `${sourceFilePrefix(userId, documentId, sourceFileId)}ocr.pdf`;
    await putObject(key, result.pdf, { contentType: "application/pdf" });

    await sourceFiles.applyOcr(sourceFileId, {
      pdfStorageKey: key,
      hasTextLayer: afterProbe.hasTextLayer,
      log: log.join("\n"),
    });

    console.log(
      `[ocr] ${documentId} done in ${result.ms}ms (${result.language}${result.exact ? "" : ", fallback"})`,
    );
  } catch (error) {
    const message =
      error instanceof OcrError
        ? error.message
        : "OCR failed. The document is unchanged and still usable.";

    if (error instanceof OcrError) log.push(...error.log);
    log.push(`OCR FAILED: ${message}`);

    await sourceFiles.appendLog(sourceFileId, log.join("\n"));
    // Deliberately NOT setting the document to FAILED: it was fine before OCR
    // and it is fine now. A failed enhancement must not break what worked.
    console.error(`[ocr] ${documentId} failed:`, error);
    throw error;
  }
}
