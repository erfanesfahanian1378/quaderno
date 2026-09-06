import { prisma } from "./client";

/**
 * Liveness checks. Reports booleans and counts only — never user content —
 * because this is the one unauthenticated endpoint under /api.
 */
export async function checkHealth(): Promise<{
  db: boolean;
  storage: boolean;
  queueDepth: number | null;
}> {
  const [db, storage, queueDepth] = await Promise.all([
    checkDatabase(),
    checkStorage(),
    checkQueueDepth(),
  ]);

  return { db, storage, queueDepth };
}

async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function checkStorage(): Promise<boolean> {
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) return false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    // A HEAD on the endpoint proves reachability without needing credentials
    // or listing anything.
    const response = await fetch(endpoint, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timer);
    // Any answer at all means the store is up; 403 is a perfectly healthy
    // response to an unauthenticated HEAD.
    return response.status > 0;
  } catch {
    return false;
  }
}

/** A climbing queue depth is the first sign a worker has died. */
async function checkQueueDepth(): Promise<number | null> {
  try {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count
      FROM pgboss.job
      WHERE state IN ('created', 'retry')
    `;
    return Number(rows[0]?.count ?? 0);
  } catch {
    // pg-boss may not have created its schema yet on a cold start.
    return null;
  }
}
