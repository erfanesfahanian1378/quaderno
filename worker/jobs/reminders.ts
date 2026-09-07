import type PgBoss from "pg-boss";
import { QUEUES } from "../queue";
import { sweep } from "../../src/server/services/notifications/reminders";
import { pushConfigured } from "../../src/server/services/notifications/push";

/**
 * The reminder sweep: every minute, ask who needs telling.
 *
 * A minute is the coarsest interval that can still honour "ten minutes before"
 * without drifting into "seven minutes before". The work per tick is small —
 * a single query that returns only users who have both a subscription and a
 * preference, which on a quiet account is none.
 *
 * Sending exactly once is not this file's problem: the reminder service claims
 * each notification with a unique row first, so a slow tick overlapping the
 * next one cannot produce a duplicate.
 */
export async function registerReminders(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUES.reminders);

  await boss.work(
    QUEUES.reminders,
    { batchSize: 1, pollingIntervalSeconds: 15 },
    async () => {
      const result = await sweep();
      if (result.classReminders || result.studyReminders) {
        console.log(
          `[reminders] sent ${result.classReminders} class, ${result.studyReminders} study`,
        );
      }
    },
  );

  if (!pushConfigured()) {
    // Said once, at boot, rather than swallowed. Reminders silently doing
    // nothing because a key is missing is exactly the kind of thing nobody
    // discovers until they miss a class.
    console.warn(
      "[reminders] VAPID keys are not set — reminders are off. See .env.example.",
    );
  }

  await boss.schedule(QUEUES.reminders, "* * * * *", {});
}
