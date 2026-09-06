// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { applyIntegrationEnv, storageReachable } from "../../setup/integration";

/**
 * PHASE-01 acceptance criterion:
 *
 *   "Uploading a file to MinIO through the storage adapter and reading it
 *    back via a signed URL passes as an integration test."
 *
 * Skipped, not failed, when MinIO is not running — a contributor without
 * Docker up gets an honest message rather than red they cannot act on. CI
 * always has the service, so the coverage is real where it counts.
 */

const USER = "clx1storage00000000000000";
const DOC = "clx1storagedoc0000000000";
const SRC = "clx1storagesrc0000000000";

let available = false;

beforeAll(async () => {
  applyIntegrationEnv();
  available = await storageReachable();
  if (!available) {
    console.warn(
      `[skip] MinIO is not reachable at ${process.env.S3_ENDPOINT} — run \`docker compose --profile dev up -d\``,
    );
  }
});

describe("storage round trip", () => {
  it("puts an object, signs a read URL, and gets the same bytes back", async () => {
    if (!available) return;

    const { putObject, getSignedReadUrl, deletePrefix, getObjectBytes } =
      await import("@/server/storage");
    const { normalisedPdfKey, userPrefix } =
      await import("@/server/storage/keys");

    const key = normalisedPdfKey(USER, DOC, SRC);
    // A real PDF header plus accented text, so this also proves the adapter
    // is not mangling bytes on the way through.
    const body = new TextEncoder().encode("%PDF-1.7\n% àèéìòù çœ ëïü\n%%EOF\n");

    try {
      await putObject(key, body, { contentType: "application/pdf" });

      const direct = await getObjectBytes(key);
      expect(new TextDecoder().decode(direct)).toBe(
        new TextDecoder().decode(body),
      );

      // And through a signed URL, which is how the browser actually reads it.
      const { url, expiresAt } = await getSignedReadUrl(USER, key);
      expect(url).toContain(key);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

      const response = await fetch(url);
      expect(response.status).toBe(200);
      const fetched = new Uint8Array(await response.arrayBuffer());
      expect(new TextDecoder().decode(fetched)).toBe(
        new TextDecoder().decode(body),
      );
    } finally {
      await deletePrefix(userPrefix(USER));
    }
  });

  it("refuses to sign a URL for another user's key", async () => {
    if (!available) return;

    const { getSignedReadUrl } = await import("@/server/storage");
    const { normalisedPdfKey } = await import("@/server/storage/keys");

    const foreignKey = normalisedPdfKey("clx1someoneelse000000000", DOC, SRC);

    await expect(getSignedReadUrl(USER, foreignKey)).rejects.toThrow(
      /outside the user's namespace/,
    );
  });

  it("signs an upload URL a browser can PUT straight to", async () => {
    if (!available) return;

    const { getSignedUploadUrl, getObjectBytes, deletePrefix } =
      await import("@/server/storage");
    const { originalKey, userPrefix } = await import("@/server/storage/keys");

    const key = originalKey(USER, DOC, SRC, "text/plain");
    const body = "ciao, quaderno";

    try {
      const { url, headers } = await getSignedUploadUrl(USER, key, {
        contentType: "text/plain",
        contentLength: Buffer.byteLength(body),
      });

      const put = await fetch(url, { method: "PUT", headers, body });
      expect(put.status).toBe(200);

      const stored = await getObjectBytes(key);
      expect(new TextDecoder().decode(stored)).toBe(body);
    } finally {
      await deletePrefix(userPrefix(USER));
    }
  });

  it("deletes a whole user prefix in one call", async () => {
    if (!available) return;

    const { putObject, deletePrefix, objectExists } =
      await import("@/server/storage");
    const { thumbnailKey, userPrefix } = await import("@/server/storage/keys");

    const keys = ["clx1leafa0000000000000000", "clx1leafb0000000000000000"].map(
      (leafId) => thumbnailKey(USER, DOC, leafId),
    );

    for (const key of keys) {
      await putObject(key, new Uint8Array([1, 2, 3]), {
        contentType: "image/webp",
      });
    }

    const deleted = await deletePrefix(userPrefix(USER));
    expect(deleted).toBeGreaterThanOrEqual(keys.length);

    for (const key of keys) {
      expect(await objectExists(key)).toBe(false);
    }
  });
});
