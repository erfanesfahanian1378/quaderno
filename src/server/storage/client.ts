import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env";
import { logger } from "../logger";
import { assertKeyBelongsTo } from "./keys";

/**
 * S3-compatible storage. MinIO locally, R2 or B2 in production — the only
 * difference is `S3_FORCE_PATH_STYLE`.
 *
 * The contract that matters: **bytes never pass through the Node process.**
 * Uploads are presigned PUTs straight to the store, reads are 5-minute signed
 * GETs. This is what keeps the web container at ~300 MB while someone uploads
 * a 50 MB deck (ARCHITECTURE.md §2, §6).
 */

/** Signed URLs are short-lived, single-object and read-only. */
export const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes
const UPLOAD_URL_TTL_SECONDS = 900; // 15 minutes — allows a slow mobile upload

let client: S3Client | null = null;
let publicClient: S3Client | null = null;

function build(endpoint: string): S3Client {
  const config = env();
  return new S3Client({
    endpoint,
    region: config.S3_REGION,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
  });
}

/** For server-side object access: reads, writes, deletes. */
export function s3(): S3Client {
  if (!client) client = build(env().S3_ENDPOINT);
  return client;
}

/**
 * For **presigning URLs the browser will use**.
 *
 * Signs against S3_PUBLIC_ENDPOINT when it differs from the internal one.
 * SigV4 covers the Host header, so the URL must be generated against the host
 * that will actually receive the request — rewriting the host afterwards
 * invalidates the signature. Handing a browser a URL for an address it cannot
 * reach (a phone told to upload to "localhost") is a silent failure: the PUT
 * goes nowhere and the document never leaves PENDING.
 */
export function s3Public(): S3Client {
  if (!publicClient) {
    const config = env();
    publicClient = config.S3_PUBLIC_ENDPOINT
      ? build(config.S3_PUBLIC_ENDPOINT)
      : s3();
  }
  return publicClient;
}

export function bucket(): string {
  return env().S3_BUCKET;
}

/** Test seam. */
export function __resetS3ForTests(): void {
  client = null;
  publicClient = null;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export async function putObject(
  key: string,
  body: Uint8Array | Buffer | string,
  options: { contentType?: string; cacheControl?: string } = {},
): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: options.contentType,
      CacheControl: options.cacheControl,
    }),
  );
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const result = await s3().send(
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
  );
  if (!result.Body) throw new Error(`Object has no body: ${key}`);
  return result.Body.transformToByteArray();
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function headObject(
  key: string,
): Promise<{ byteSize: number; contentType: string | undefined } | null> {
  try {
    const result = await s3().send(
      new HeadObjectCommand({ Bucket: bucket(), Key: key }),
    );
    return {
      byteSize: result.ContentLength ?? 0,
      contentType: result.ContentType,
    };
  } catch {
    return null;
  }
}

/**
 * A read URL for the browser. `userId` is required, not optional — signing is
 * exactly where a scoping bug becomes a cross-tenant data leak, so the check
 * is on the signing path itself and cannot be forgotten by a caller.
 */
export async function getSignedReadUrl(
  userId: string,
  key: string,
  options: { ttlSeconds?: number; downloadAs?: string } = {},
): Promise<{ url: string; expiresAt: Date }> {
  assertKeyBelongsTo(userId, key);

  const ttl = options.ttlSeconds ?? SIGNED_URL_TTL_SECONDS;
  const url = await getSignedUrl(
    s3Public(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ...(options.downloadAs
        ? {
            ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(options.downloadAs)}`,
          }
        : {}),
    }),
    { expiresIn: ttl },
  );

  return { url, expiresAt: new Date(Date.now() + ttl * 1000) };
}

/**
 * A presigned PUT for a direct browser upload. `contentLength` is signed in,
 * so a client cannot presign a 1 MB upload and then push 500 MB through it.
 */
export async function getSignedUploadUrl(
  userId: string,
  key: string,
  options: { contentType: string; contentLength: number; ttlSeconds?: number },
): Promise<{ url: string; headers: Record<string, string>; expiresAt: Date }> {
  assertKeyBelongsTo(userId, key);

  const ttl = options.ttlSeconds ?? UPLOAD_URL_TTL_SECONDS;
  const url = await getSignedUrl(
    s3Public(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      ContentType: options.contentType,
      ContentLength: options.contentLength,
    }),
    { expiresIn: ttl },
  );

  return {
    url,
    headers: {
      "Content-Type": options.contentType,
      "Content-Length": String(options.contentLength),
    },
    expiresAt: new Date(Date.now() + ttl * 1000),
  };
}

/**
 * Delete everything under a prefix. Account deletion is one call to this with
 * `u/{userId}/`, which is the reason keys are shaped the way they are.
 */
export async function deletePrefix(prefix: string): Promise<number> {
  let deleted = 0;
  let continuationToken: string | undefined;

  do {
    const listed = await s3().send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    const keys = (listed.Contents ?? [])
      .map((object) => object.Key)
      .filter((key): key is string => Boolean(key));

    if (keys.length > 0) {
      // DeleteObjects caps at 1000 per call, which matches ListObjectsV2's
      // default page size, so one page maps to one delete.
      await s3().send(
        new DeleteObjectsCommand({
          Bucket: bucket(),
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      deleted += keys.length;
    }

    continuationToken = listed.IsTruncated
      ? listed.NextContinuationToken
      : undefined;
  } while (continuationToken);

  logger.info({ prefix, deleted }, "deleted storage prefix");
  return deleted;
}
