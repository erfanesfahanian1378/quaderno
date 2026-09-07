import webpush from "web-push";
import { env } from "@/server/env";
import * as subscriptions from "@/server/repositories/push-subscription";
import { logger } from "@/server/logger";

/**
 * Sending a push.
 *
 * Used by the worker's reminder sweep, and by the settings page's "send a test
 * one" button — which exists because notification permission is the single
 * most confusing thing on the web platform, and being able to prove it works
 * is worth more than any amount of explanatory text.
 */

export type PushMessage = {
  title: string;
  body: string;
  /** Where clicking it goes. A same-origin path. */
  url?: string;
  /**
   * Replaces an earlier notification with the same tag rather than stacking.
   * Two reminders for one class should never both sit on the lock screen.
   */
  tag?: string;
};

let configured = false;

/** True when all three keys are present. Reminders are off otherwise. */
export function pushConfigured(): boolean {
  const config = env();
  return Boolean(
    config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY && config.VAPID_SUBJECT,
  );
}

export function publicKey(): string | null {
  return env().VAPID_PUBLIC_KEY ?? null;
}

function configure(): void {
  if (configured) return;
  const config = env();
  webpush.setVapidDetails(
    config.VAPID_SUBJECT!,
    config.VAPID_PUBLIC_KEY!,
    config.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

/**
 * Deliver to every browser this user has registered, and prune the dead ones.
 *
 * A push endpoint dies when the browser is uninstalled, the permission is
 * revoked, or the profile is wiped, and the push service says so with 404 or
 * 410. Those are permanent — retrying forever would mean every sweep spending
 * its time on browsers that no longer exist.
 */
export async function sendToUser(
  userId: string,
  message: PushMessage,
): Promise<{ sent: number; failed: number }> {
  if (!pushConfigured()) return { sent: 0, failed: 0 };
  configure();

  const targets = await subscriptions.activeForUser(userId);
  if (targets.length === 0) return { sent: 0, failed: 0 };

  const payload = JSON.stringify(message);
  let sent = 0;
  let failed = 0;

  await Promise.all(
    targets.map(async (target) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: target.endpoint,
            keys: { p256dh: target.p256dh, auth: target.auth },
          },
          payload,
        );
        sent += 1;
      } catch (error) {
        failed += 1;

        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await subscriptions.markExpired(target.id);
          return;
        }

        logger.warn(
          { err: error, subscriptionId: target.id, status },
          "push delivery failed",
        );
      }
    }),
  );

  return { sent, failed };
}
