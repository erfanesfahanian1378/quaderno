import type PgBoss from "pg-boss";
import { sweepIdempotencyKeys } from "../../src/server/api/idempotency";
import { QUEUES } from "../queue";
import * as study from "../../src/server/repositories/study";

/**
 * Closes abandoned timers.
 *
 * DATA_MODEL.md §7: a session with `endedAt = null` whose heartbeat has been
 * quiet for longer than STALE_TIMER_MINUTES is closed **at its last
 * heartbeat**, not at now. That is the difference between a closed laptop
 * costing you one minute of logged time and a fourteen-hour phantom session
 * that quietly ruins your weekly numbers.
 */
export async function registerTimerReaper(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUES.timerReaper);

  await boss.work(QUEUES.timerReaper, { batchSize: 1 }, async () => {
    await reap();
  });

  // Every five minutes. The window is 20 minutes, so this is fine-grained
  // enough that nobody notices the delay.
  await boss.schedule(QUEUES.timerReaper, "*/5 * * * *", {});
}

/**
 * Idempotency keys outlive their usefulness.
 *
 * A key matters only while its write could still be retried, and the outbox
 * gives up long before thirty days. Without a sweep the table grows for ever —
 * one row per grade and per comment made offline, kept indefinitely.
 *
 * Daily, and folded in here rather than given its own queue: it is one delete
 * statement and the reaper is already the place where housekeeping lives.
 */
export async function sweepKeys(): Promise<number> {
  const removed = await sweepIdempotencyKeys();
  if (removed > 0)
    console.log(`[reaper] dropped ${removed} idempotency key(s)`);
  return removed;
}

export async function reap(): Promise<number> {
  const minutes = Number(process.env.STALE_TIMER_MINUTES ?? 20);
  const staleBefore = new Date(Date.now() - minutes * 60_000);

  await sweepKeys();

  const closed = await study.closeStaleTimers(staleBefore);
  if (closed.length > 0) {
    console.log(`[reaper] closed ${closed.length} stale timer(s)`);
  }
  return closed.length;
}
