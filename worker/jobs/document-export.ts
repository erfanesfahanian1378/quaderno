import type PgBoss from "pg-boss";
import { QUEUES } from "../queue";
import { typesetInto } from "../lib/typeset";
import { bakeExport, type ExportLeaf } from "../../src/lib/export/bake";
import * as exports from "../../src/server/repositories/export";
import { getObjectBytes, putObject } from "../../src/server/storage";
import { exportKey } from "../../src/server/storage/keys";

export type ExportPayload = { exportId: string; userId: string };

/**
 * Server-side export, for documents past the 150-leaf browser limit.
 *
 * Reuses `src/lib/export/bake.ts` unchanged — it is plain pdf-lib and already
 * runs in Node. What it cannot reuse is the client typesetter: this passes
 * the WORKER copy, which is the same logic built for a different runtime.
 * Both files say so.
 */
export async function registerExport(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUES.documentExport);

  await boss.work<ExportPayload>(
    QUEUES.documentExport,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async ([job]) => {
      if (!job) return;
      await runExport(job.data);
    },
  );
}

export async function runExport(payload: ExportPayload): Promise<void> {
  const { exportId, userId } = payload;

  const record = await exports.forJob(exportId);
  if (!record) return;

  try {
    await exports.setStatus(exportId, "RUNNING");

    const data = await exports.gatherDocument(record.documentId, userId);
    if (!data) throw new Error("Document is gone");

    const sourcePdf = data.pdfStorageKey
      ? await getObjectBytes(data.pdfStorageKey)
      : null;

    /*
     * A server export has no theme, so token keys resolve to the LIGHT
     * values. Anything else would bake a dark-mode colour into a file that
     * will be read on paper — the client export resolves against the reader's
     * actual theme, which is why it does it in the browser.
     */
    const leaves: ExportLeaf[] = data.leaves.map((leaf) => ({
      ...leaf,
      annotations: leaf.annotations.map((annotation) => ({
        ...annotation,
        colorHex: LIGHT_TOKENS[annotation.colorHex] ?? "#FFE27A",
      })),
    }));

    const pdf = await bakeExport({
      sourcePdf,
      leaves,
      flavour: record.flavour as "flattened" | "layered" | "notes-only",
      title: data.title,
      typesetNote: (doc, markdown) => typesetInto(doc, markdown, true),
      // The worker has no theme, so a formatted note's spans resolve to the
      // light palette — the same table used for the annotation colours above.
      resolveToken: (key) => LIGHT_TOKENS[key] ?? "#1C1B18",
    });

    const key = exportKey(userId, exportId);
    await putObject(key, pdf, { contentType: "application/pdf" });
    await exports.complete(exportId, key);

    console.log(
      `[export] ${exportId} ready: ${leaves.length} leaves, ${pdf.length} bytes`,
    );
  } catch (error) {
    await exports.fail(
      exportId,
      error instanceof Error ? error.message : "Export failed",
    );
    console.error(`[export] ${exportId} failed:`, error);
    throw error;
  }
}

/**
 * The light-theme values from `src/styles/tokens.css`.
 *
 * Duplicated here deliberately: the worker has no DOM to read computed styles
 * from, and importing a stylesheet into a Node process is not a thing. The
 * contrast test in tests/unit/contrast.spec.ts reads the CSS, so a drift
 * between the two shows up there rather than silently.
 */
const LIGHT_TOKENS: Record<string, string> = {
  "hl-yellow": "#FFE27A",
  "hl-green": "#A9E5A0",
  "hl-blue": "#9FD0F5",
  "hl-pink": "#F7A8C4",
  "hl-orange": "#FFC48A",
  "ink-black": "#1C1B18",
  "ink-rust": "#B14A32",
  "ink-blue": "#2C6BB1",
  "ink-green": "#3F7D58",
};
