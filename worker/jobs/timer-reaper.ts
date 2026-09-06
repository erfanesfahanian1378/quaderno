import type PgBoss from "pg-boss";
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

export async function reap(): Promise<number> {
  const minutes = Number(process.env.STALE_TIMER_MINUTES ?? 20);
  const staleBefore = new Date(Date.now() - minutes * 60_000);

  const closed = await study.closeStaleTimers(staleBefore);
  if (closed.length > 0) {
    console.log(`[reaper] closed ${closed.length} stale timer(s)`);
  }
  return closed.length;
}
