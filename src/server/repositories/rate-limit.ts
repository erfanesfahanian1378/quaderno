import { prisma } from "./client";

/**
 * Postgres token bucket. No Redis in this system (ARCHITECTURE.md §1), and a
 * rate limiter is the one thing people reach for Redis for by reflex.
 *
 * The table is created by a migration alongside this file. `consume` is a
 * single atomic upsert-and-check written as raw SQL because the read-modify-
 * write has to happen inside one statement — doing it in application code
 * races, and a login limiter that races is not a limiter.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export async function consume(
  bucket: string,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const rows = await prisma.$queryRaw<
    { count: number; window_started_at: Date }[]
  >`
    INSERT INTO "RateLimit" ("bucket", "key", "count", "windowStartedAt")
    VALUES (${bucket}, ${key}, 1, now())
    ON CONFLICT ("bucket", "key") DO UPDATE
      SET "count" = CASE
            WHEN "RateLimit"."windowStartedAt" < now() - make_interval(secs => ${windowSeconds}::double precision)
            THEN 1
            ELSE "RateLimit"."count" + 1
          END,
          "windowStartedAt" = CASE
            WHEN "RateLimit"."windowStartedAt" < now() - make_interval(secs => ${windowSeconds}::double precision)
            THEN now()
            ELSE "RateLimit"."windowStartedAt"
          END
    RETURNING "count", "windowStartedAt" AS window_started_at
  `;

  const row = rows[0];
  if (!row) return { allowed: true, remaining: limit, retryAfterSeconds: 0 };

  const elapsed = (Date.now() - row.window_started_at.getTime()) / 1000;
  const retryAfterSeconds = Math.max(1, Math.ceil(windowSeconds - elapsed));

  return {
    allowed: row.count <= limit,
    remaining: Math.max(0, limit - row.count),
    retryAfterSeconds,
  };
}

/** Clears a bucket for a key — called after a successful login. */
export async function reset(bucket: string, key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { bucket, key } });
}
