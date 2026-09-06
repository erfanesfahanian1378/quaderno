import type PgBoss from "pg-boss";
import { QUEUES } from "../queue";

/**
 * Proves the enqueue -> consume path end to end. PHASE-01 acceptance criteria
 * asks for exactly this: a job enqueued from a script and consumed by
 * `pnpm worker:dev`. It stays in the repo after Phase 01 as the queue's
 * smoke test.
 */
export type NoopPayload = { readonly message?: string; readonly at?: string };

export async function registerNoop(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUES.noop);

  await boss.work<NoopPayload>(QUEUES.noop, { batchSize: 1 }, async ([job]) => {
    if (!job) return;
    console.log(
      `[noop] consumed job ${job.id}: ${job.data?.message ?? "(no message)"}`,
    );
  });
}
