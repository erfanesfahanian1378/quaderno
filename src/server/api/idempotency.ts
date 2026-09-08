import { NextResponse } from "next/server";
import { prisma } from "@/server/repositories/client";
import type { Ctx } from "@/server/repositories/base";

/**
 * Making a write safe to retry.
 *
 * The outbox retries, and a retry can arrive after the first attempt already
 * succeeded — the response was lost in a tunnel, the tab was closed, the
 * network dropped between the write landing and the reply arriving. Without a
 * key, that second attempt grades a card twice or posts a comment twice, and
 * neither is something the reader can undo.
 *
 * Only for writes that are not naturally idempotent. A note page `PUT` is
 * last-write-wins and needs nothing; a `POST` that creates a row needs this.
 *
 * The key is scoped to the route as well as the user, so a key replayed
 * against a different endpoint is treated as new rather than returning some
 * unrelated stored response.
 */
export const IDEMPOTENCY_HEADER = "idempotency-key";

export function idempotencyKeyOf(request: Request): string | null {
  const value = request.headers.get(IDEMPOTENCY_HEADER)?.trim();
  if (!value) return null;
  // Bounded: the column is indexed and the header is attacker-controlled.
  return value.length > 0 && value.length <= 200 ? value : null;
}

/**
 * Run `handler` at most once for a given key.
 *
 * A replay returns the stored response verbatim, including its status, so the
 * client cannot tell the difference — which is the point. Without a key the
 * handler simply runs, so an online client that never sets one is unaffected.
 */
export async function withIdempotency<T>(
  ctx: Ctx,
  request: Request,
  scope: string,
  handler: () => Promise<{ status: number; body: T }>,
): Promise<NextResponse> {
  const key = idempotencyKeyOf(request);

  if (!key) {
    const fresh = await handler();
    return NextResponse.json(fresh.body, { status: fresh.status });
  }

  const existing = await prisma.idempotencyKey.findUnique({
    where: { userId_scope_key: { userId: ctx.userId, scope, key } },
    select: { response: true },
  });

  if (existing) {
    const stored = existing.response as { status: number; body: unknown };
    return NextResponse.json(stored.body, {
      status: stored.status,
      // So a reader of the logs can tell a replay from a first attempt.
      headers: { "x-idempotent-replay": "true" },
    });
  }

  const result = await handler();

  /*
   * Recorded AFTER the work, and a failure to record is not a failure of the
   * write. The alternative — recording first — would make a crash mid-handler
   * look like a completed write and silently swallow the retry that would
   * have fixed it.
   *
   * Two concurrent first attempts can both do the work; the unique constraint
   * makes the second insert fail, which is caught. That is a real race, but it
   * needs two tabs flushing the same queued write at the same moment, and the
   * outbox flushes one entry at a time per stream.
   */
  await prisma.idempotencyKey
    .create({
      data: {
        userId: ctx.userId,
        key,
        scope,
        response: { status: result.status, body: result.body } as never,
      },
    })
    .catch(() => undefined);

  return NextResponse.json(result.body, { status: result.status });
}

/**
 * Drop keys older than 30 days.
 *
 * A key is only useful while its write could still be retried, and the outbox
 * gives up long before this. Without a sweep the table grows for ever.
 */
export async function sweepIdempotencyKeys(
  olderThan: Date = new Date(Date.now() - 30 * 86_400_000),
): Promise<number> {
  const result = await prisma.idempotencyKey.deleteMany({
    where: { createdAt: { lt: olderThan } },
  });
  return result.count;
}
