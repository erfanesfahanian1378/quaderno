/**
 * Storage key builders — DATA_MODEL.md §5.
 *
 *   u/{userId}/d/{documentId}/src/{sourceFileId}/original{ext}
 *   u/{userId}/d/{documentId}/src/{sourceFileId}/normalised.pdf
 *   u/{userId}/d/{documentId}/thumb/{leafId}.webp
 *   u/{userId}/export/{exportId}.pdf
 *
 * The `u/{userId}` prefix is load-bearing twice over: "delete my account" is
 * one prefix delete, and a mis-scoped signed URL cannot reach another user's
 * namespace even if the rest of the key is attacker-controlled.
 *
 * Uploaded filenames are NEVER used as keys. They are user input; they arrive
 * with slashes, NUL bytes, `..` and RTL overrides in them. The original name
 * is kept in `SourceFile.originalName` for display and for the download
 * `Content-Disposition`, and nowhere else.
 */

/** Ids are cuids; anything else is a bug or an injection attempt. */
const ID_PATTERN = /^[a-z0-9_-]{1,64}$/i;

function assertId(value: string, label: string): string {
  if (!ID_PATTERN.test(value)) {
    throw new Error(`Refusing to build a storage key: invalid ${label}`);
  }
  return value;
}

/**
 * Extensions are taken from a fixed list, not from the uploaded name — an
 * unrecognised type stores no extension at all rather than whatever the user
 * typed after the last dot.
 */
const EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
  "application/msword": ".doc",
  "application/vnd.oasis.opendocument.text": ".odt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    ".pptx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.oasis.opendocument.presentation": ".odp",
  "application/rtf": ".rtf",
  "text/rtf": ".rtf",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/heic": ".heic",
};

export function extensionForMime(mimeType: string): string {
  return EXTENSIONS[mimeType.toLowerCase()] ?? "";
}

export function userPrefix(userId: string): string {
  return `u/${assertId(userId, "userId")}/`;
}

export function documentPrefix(userId: string, documentId: string): string {
  return `${userPrefix(userId)}d/${assertId(documentId, "documentId")}/`;
}

export function sourceFilePrefix(
  userId: string,
  documentId: string,
  sourceFileId: string,
): string {
  return `${documentPrefix(userId, documentId)}src/${assertId(sourceFileId, "sourceFileId")}/`;
}

export function originalKey(
  userId: string,
  documentId: string,
  sourceFileId: string,
  mimeType: string,
): string {
  return `${sourceFilePrefix(userId, documentId, sourceFileId)}original${extensionForMime(mimeType)}`;
}

/**
 * The normalised PDF. When the upload was already a PDF this key still gets
 * written — the repaired, linearised output is a *derived artefact* and the
 * original stays byte-identical (CLAUDE.md rule 8).
 */
export function normalisedPdfKey(
  userId: string,
  documentId: string,
  sourceFileId: string,
): string {
  return `${sourceFilePrefix(userId, documentId, sourceFileId)}normalised.pdf`;
}

export function thumbnailKey(
  userId: string,
  documentId: string,
  leafId: string,
): string {
  // PNG because that is what pdftocairo produces and what an <img> can show.
  return `${documentPrefix(userId, documentId)}thumb/${assertId(leafId, "leafId")}.png`;
}

export function exportKey(userId: string, exportId: string): string {
  return `${userPrefix(userId)}export/${assertId(exportId, "exportId")}.pdf`;
}

/** Inline images pasted into a note page. */
export function noteAssetKey(
  userId: string,
  documentId: string,
  assetId: string,
  mimeType: string,
): string {
  return `${documentPrefix(userId, documentId)}note/${assertId(assetId, "assetId")}${extensionForMime(mimeType)}`;
}

/**
 * Defence in depth: before signing a URL, assert the key is inside the
 * requesting user's namespace. The repository layer should already have made
 * this impossible; this catches the case where it did not.
 */
export function assertKeyBelongsTo(userId: string, key: string): void {
  if (!key.startsWith(userPrefix(userId))) {
    throw new Error("Refusing to sign a key outside the user's namespace");
  }
}
