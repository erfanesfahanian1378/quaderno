import { prisma } from "./client";
import type { Ctx } from "./base";

/** Push endpoints, one row per browser. */

export type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: Date;
};

const FIELDS = {
  id: true,
  endpoint: true,
  p256dh: true,
  auth: true,
  userAgent: true,
  createdAt: true,
} as const;

/**
 * Register a browser, or refresh the one already there.
 *
 * Upsert on the endpoint rather than insert: a browser re-subscribes on every
 * permission change and after some updates, and it hands back the SAME
 * endpoint. Inserting would grow a row per visit and send every reminder
 * several times to one device.
 */
export async function upsert(
  ctx: Ctx,
  input: {
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string | null;
  },
): Promise<SubscriptionRow> {
  return prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userId: ctx.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
      lastSeenAt: new Date(),
    },
    update: {
      // Re-assigned to whoever is signed in now: a shared browser must not
      // keep pushing the previous account's classes.
      userId: ctx.userId,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
      lastSeenAt: new Date(),
      expiredAt: null,
    },
    select: FIELDS,
  });
}

export async function remove(ctx: Ctx, endpoint: string): Promise<boolean> {
  const result = await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: ctx.userId },
  });
  return result.count > 0;
}

export async function listForUser(ctx: Ctx): Promise<SubscriptionRow[]> {
  return prisma.pushSubscription.findMany({
    where: { userId: ctx.userId, expiredAt: null },
    orderBy: { createdAt: "desc" },
    select: FIELDS,
  });
}

// --- Worker side: the sweep already knows whose reminder it is sending -----

export async function activeForUser(
  userId: string,
): Promise<SubscriptionRow[]> {
  return prisma.pushSubscription.findMany({
    where: { userId, expiredAt: null },
    select: FIELDS,
  });
}

export async function markExpired(id: string): Promise<void> {
  await prisma.pushSubscription
    .update({ where: { id }, data: { expiredAt: new Date() } })
    .catch(() => undefined);
}
