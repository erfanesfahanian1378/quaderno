import PgBoss from "pg-boss";

/**
 * The job queue.
 *
 * pg-boss on the same Postgres the app already uses. No Redis anywhere in this
 * system — ARCHITECTURE.md §1 puts that at ~150 MB of RSS and one more moving
 * part, on a box with 2 GB total.
 */

export const QUEUES = {
  noop: "noop",
  documentIngest: "document.ingest",
  documentOcr: "document.ocr",
  documentExport: "document.export",
  reminders: "notifications.sweep",
  thumbnail: "document.thumbnail",
  timerReaper: "study.timer-reaper",
  accountDelete: "account.delete",
  dataExport: "account.export",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

let boss: PgBoss | null = null;

function connectionString(): string {
  const url = process.env.QUEUE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "QUEUE_DATABASE_URL (or DATABASE_URL) is required to reach the job queue",
    );
  }
  return url;
}

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;

  boss = new PgBoss({
    connectionString: connectionString(),
    // pg-boss keeps its own tables out of the app's schema.
    schema: "pgboss",
    // The worker is one small process; it does not need a wide pool.
    max: 4,
    // Keep finished jobs around long enough to debug a failed conversion.
    archiveCompletedAfterSeconds: 60 * 60 * 12,
    deleteAfterDays: 7,
  });

  boss.on("error", (error) => {
    console.error("[queue] pg-boss error", error);
  });

  await boss.start();
  return boss;
}

export async function stopBoss(): Promise<void> {
  if (!boss) return;
  await boss.stop({ graceful: true, wait: true });
  boss = null;
}

/**
 * Enqueue from the web process. Route handlers use this rather than doing the
 * work inline: CLAUDE.md says a handler that costs more than ~1 s of CPU is
 * misplaced.
 */
export async function enqueue<T extends object>(
  queue: QueueName,
  data: T,
  options: PgBoss.SendOptions = {},
): Promise<string | null> {
  const instance = await getBoss();
  await instance.createQueue(queue).catch(() => {
    // createQueue is idempotent in effect; a race between two web instances
    // starting at once is not an error worth failing the request over.
  });
  return instance.send(queue, data, options);
}
