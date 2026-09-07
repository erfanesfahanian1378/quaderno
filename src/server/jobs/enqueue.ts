import PgBoss from "pg-boss";
import { logger } from "../logger";

/**
 * Enqueue side of the job queue, for the **web** process.
 *
 * Separate from `worker/queue.ts` on purpose: the web container must be able
 * to send jobs without importing the worker's consumers, which pull in
 * LibreOffice orchestration, sharp and pdf-lib. Importing those here would put
 * them in the web bundle and blow the RSS budget that ARCHITECTURE.md §6 sets.
 */

export const QUEUE_NAMES = {
  documentIngest: "document.ingest",
  documentOcr: "document.ocr",
  documentExport: "document.export",
  accountDelete: "account.delete",
  dataExport: "account.export",
} as const;

let boss: PgBoss | null = null;
let starting: Promise<PgBoss> | null = null;

async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  if (starting) return starting;

  const connectionString =
    process.env.QUEUE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("QUEUE_DATABASE_URL (or DATABASE_URL) is not configured");
  }

  starting = (async () => {
    const instance = new PgBoss({
      connectionString,
      schema: "pgboss",
      // The web process only sends; it needs a small pool.
      max: 2,
    });
    instance.on("error", (error) => logger.error({ err: error }, "pg-boss"));
    await instance.start();
    boss = instance;
    return instance;
  })();

  return starting;
}

export async function enqueueIngest(payload: {
  sourceFileId: string;
  documentId: string;
  userId: string;
}): Promise<string | null> {
  const instance = await getBoss();
  await instance.createQueue(QUEUE_NAMES.documentIngest).catch(() => {
    // Idempotent in effect; a race between two web instances starting is not
    // worth failing an upload over.
  });

  return instance.send(QUEUE_NAMES.documentIngest, payload, {
    retryLimit: 3,
    retryDelay: 10,
    retryBackoff: true,
    expireInMinutes: 10,
  });
}

export async function enqueueExport(payload: {
  exportId: string;
  userId: string;
}): Promise<string | null> {
  const instance = await getBoss();
  await instance.createQueue(QUEUE_NAMES.documentExport).catch(() => {});
  return instance.send(QUEUE_NAMES.documentExport, payload, {
    retryLimit: 2,
    expireInMinutes: 30,
  });
}

export async function enqueueOcr(payload: {
  sourceFileId: string;
  documentId: string;
  userId: string;
  languageCode: string;
}): Promise<string | null> {
  const instance = await getBoss();
  await instance.createQueue(QUEUE_NAMES.documentOcr).catch(() => {});
  return instance.send(QUEUE_NAMES.documentOcr, payload, {
    retryLimit: 2,
    expireInMinutes: 20,
  });
}
