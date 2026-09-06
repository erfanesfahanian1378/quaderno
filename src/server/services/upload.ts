import { createHash } from "node:crypto";
import {
  conflict,
  notFound,
  quotaExceeded,
  unsupportedMediaType,
  validationFailed,
} from "../errors";
import { env } from "../env";
import * as documents from "../repositories/document";
import * as sourceFiles from "../repositories/source-file";
import * as users from "../repositories/user";
import * as courses from "../repositories/course";
import type { Ctx } from "../repositories/base";
import { getSignedUploadUrl, getObjectBytes, headObject } from "../storage";
import { originalKey } from "../storage/keys";
import { detectKind, extensionFor, isAllowedMime } from "./ingest/detect";
import { enforce } from "../auth/rate-limit";
import { logger } from "../logger";

/**
 * Two-step upload, so **bytes never pass through the Node process**
 * (ARCHITECTURE.md §2):
 *
 *   1. presign  — validate, create the Document, hand back a signed PUT
 *   2. (client PUTs straight to object storage)
 *   3. complete — verify the object and its MAGIC BYTES, then enqueue ingest
 *
 * The magic-byte check has to happen in step 3, not step 1: at presign time
 * the bytes do not exist yet, so anything checked then is only the client's
 * claim about them.
 */

/** How much of the object to read for detection. Signatures are all short. */
const SNIFF_BYTES = 512;

export async function presign(
  ctx: Ctx,
  input: {
    fileName: string;
    mimeType: string;
    byteSize: number;
    languageId: string;
    courseId?: string | undefined;
    classSessionId?: string | undefined;
    title?: string | undefined;
  },
) {
  await enforce("upload", ctx.userId);

  if (!isAllowedMime(input.mimeType)) {
    throw unsupportedMediaType(
      `We cannot read ${input.mimeType || "that file type"} yet.`,
    );
  }

  const maxBytes = env().MAX_UPLOAD_BYTES;
  if (input.byteSize > maxBytes) {
    throw validationFailed(
      `That file is larger than the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`,
      { field: "byteSize" },
    );
  }
  if (input.byteSize <= 0) {
    throw validationFailed("That file is empty.", { field: "byteSize" });
  }

  // Quota is checked BEFORE handing out a signed URL. Checking afterwards
  // means the bytes are already stored and the user is already over.
  const user = await users.findById(ctx);
  if (!user) throw notFound("Account");
  if (user.storageUsedBytes + BigInt(input.byteSize) > user.storageQuotaBytes) {
    throw quotaExceeded(
      "That would take you past your storage limit. Delete something first, or empty the trash.",
    );
  }

  // Fall back to the language's default course, so an upload always lands
  // somewhere even when the UI has never shown the concept of courses.
  const courseId =
    input.courseId ??
    (await courses.findDefault(ctx, input.languageId))?.id ??
    undefined;

  const document = await documents.create(ctx, {
    languageId: input.languageId,
    courseId,
    classSessionId: input.classSessionId,
    title: input.title?.trim() || stripExtension(input.fileName),
    origin: "UPLOAD",
    status: "PENDING",
  });

  const sourceFile = await sourceFiles.create({
    documentId: document.id,
    // The uploaded name is kept for display and for the download
    // Content-Disposition, and is never used as a storage key.
    originalName: input.fileName.slice(0, 255),
    mimeType: input.mimeType,
    byteSize: BigInt(input.byteSize),
    checksumSha256: "",
    storageKey: originalKey(
      ctx.userId,
      document.id,
      // A placeholder id is not good enough; use the real one below.
      document.id,
      input.mimeType,
    ),
  });

  // Now that the SourceFile id exists, build the real key.
  const key = originalKey(
    ctx.userId,
    document.id,
    sourceFile.id,
    input.mimeType,
  );
  const upload = await getSignedUploadUrl(ctx.userId, key, {
    contentType: input.mimeType,
    contentLength: input.byteSize,
  });

  await sourceFiles.recordStorageKey(sourceFile.id, key);

  return {
    documentId: document.id,
    sourceFileId: sourceFile.id,
    uploadUrl: upload.url,
    storageKey: key,
    headers: upload.headers,
    expiresAt: upload.expiresAt,
  };
}

export async function complete(
  ctx: Ctx,
  input: { sourceFileId: string; checksumSha256?: string | undefined },
  enqueueIngest: (payload: {
    sourceFileId: string;
    documentId: string;
    userId: string;
  }) => Promise<unknown>,
) {
  const sourceFile = await sourceFiles.findById(ctx, input.sourceFileId);
  if (!sourceFile) throw notFound("Upload");

  const head = await headObject(sourceFile.storageKey);
  if (!head) {
    throw conflict("We never received that file. Try uploading it again.");
  }

  // Read only the head of the object: detection needs a few hundred bytes,
  // and pulling a 50 MB deck into the web process to check four of them would
  // undo the whole point of presigned uploads.
  const bytes = await getObjectBytes(sourceFile.storageKey);
  const sniff = bytes.slice(0, SNIFF_BYTES);

  const kind = detectKind(sniff, sourceFile.mimeType);
  if (!kind) {
    logger.warn(
      { sourceFileId: sourceFile.id, declared: sourceFile.mimeType },
      "upload rejected by magic-byte check",
    );
    await documents.setStatus(sourceFile.documentId, "FAILED");
    throw unsupportedMediaType(
      "That file is not the type it claims to be, so we did not open it.",
    );
  }

  // Checksum from the bytes we actually stored, not from the client's claim.
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (input.checksumSha256 && input.checksumSha256 !== checksum) {
    throw validationFailed("The upload was corrupted in transit.");
  }

  await sourceFiles.recordChecksum(
    sourceFile.id,
    checksum,
    BigInt(head.byteSize),
  );
  await users.addStorageUsed(ctx, BigInt(head.byteSize));

  await documents.setStatus(sourceFile.documentId, "CONVERTING");
  await enqueueIngest({
    sourceFileId: sourceFile.id,
    documentId: sourceFile.documentId,
    userId: ctx.userId,
  });

  return {
    documentId: sourceFile.documentId,
    status: "CONVERTING" as const,
    detectedKind: kind,
    extension: extensionFor(kind),
  };
}

function stripExtension(fileName: string): string {
  const base = fileName.replace(/\.[^./\\]+$/, "").trim();
  return base || "Untitled";
}
