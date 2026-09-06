import { rateLimited } from "../errors";
import * as repo from "../repositories/rate-limit";

/**
 * The buckets from API.md §Rate limits. Keeping them in one table means a new
 * limit is a constant here, not a new piece of infrastructure.
 */
export const BUCKETS = {
  loginAccount: { limit: 5, windowSeconds: 15 * 60 },
  loginIp: { limit: 20, windowSeconds: 15 * 60 },
  register: { limit: 3, windowSeconds: 60 * 60 },
  passwordReset: { limit: 5, windowSeconds: 60 * 60 },
  upload: { limit: 20, windowSeconds: 60 * 60 },
  annotationBatch: { limit: 120, windowSeconds: 60 },
  api: { limit: 600, windowSeconds: 60 },
} as const;

export type BucketName = keyof typeof BUCKETS;

/** Consumes a token and throws a 429 with Retry-After when the bucket is dry. */
export async function enforce(bucket: BucketName, key: string): Promise<void> {
  const config = BUCKETS[bucket];
  const result = await repo.consume(
    bucket,
    key,
    config.limit,
    config.windowSeconds,
  );

  if (!result.allowed) {
    throw rateLimited(
      result.retryAfterSeconds,
      "Too many attempts. Try again shortly.",
    );
  }
}

export async function clear(bucket: BucketName, key: string): Promise<void> {
  await repo.reset(bucket, key);
}
