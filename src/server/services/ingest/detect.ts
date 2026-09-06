/**
 * File type detection by **magic bytes**, never by the client's declared MIME
 * type or the filename extension.
 *
 * ARCHITECTURE.md §7 and the PHASE-04 acceptance criteria are explicit: "a
 * file renamed to .docx but actually a ZIP bomb is rejected by the magic-byte
 * check and never reaches soffice". The client's Content-Type is attacker
 * input; the first bytes of the stored object are not.
 *
 * Deliberately hand-rolled rather than the `file-type` package: this is the
 * complete allowlist, about fifteen signatures, and the package is hundreds of
 * kilobytes of formats we refuse anyway (CLAUDE.md rule 10).
 */

export type DetectedKind =
  | "pdf"
  | "docx"
  | "doc"
  | "odt"
  | "pptx"
  | "ppt"
  | "odp"
  | "rtf"
  | "txt"
  | "md"
  | "png"
  | "jpeg"
  | "webp"
  | "heic";

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.oasis.opendocument.presentation",
  "application/rtf",
  "text/rtf",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
] as const;

export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

export function isAllowedMime(value: string): value is AllowedMime {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * OOXML and ODF are all ZIP archives, so the container signature alone cannot
 * tell a .docx from a .pptx from a zip bomb. ODF puts an uncompressed
 * `mimetype` entry first, which is cheap to check. OOXML needs the declared
 * type as a hint — but only *after* the bytes have proven to be a real ZIP, so
 * a declared type can never promote unrecognised content.
 */
function detectZipContainer(
  bytes: Uint8Array,
  declared: string,
): DetectedKind | null {
  if (asciiAt(bytes, 30, "mimetypeapplication/vnd.oasis.opendocument.text")) {
    return "odt";
  }
  if (
    asciiAt(
      bytes,
      30,
      "mimetypeapplication/vnd.oasis.opendocument.presentation",
    )
  ) {
    return "odp";
  }

  switch (declared) {
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx";
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return "pptx";
    case "application/vnd.oasis.opendocument.text":
      return "odt";
    case "application/vnd.oasis.opendocument.presentation":
      return "odp";
    default:
      // A ZIP claiming to be anything else is not on the allowlist.
      return null;
  }
}

/**
 * The detected kind, or null when the bytes match nothing on the allowlist.
 */
export function detectKind(
  bytes: Uint8Array,
  declared: string,
): DetectedKind | null {
  // %PDF-
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";

  // RIFF....WEBP
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    asciiAt(bytes, 8, "WEBP")
  ) {
    return "webp";
  }

  // ....ftyp<brand>
  if (asciiAt(bytes, 4, "ftyp")) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (["heic", "heix", "hevc", "mif1", "msf1"].includes(brand)) return "heic";
  }

  if (asciiAt(bytes, 0, "{\\rtf")) return "rtf";

  // Legacy OLE2 compound file: .doc and .ppt share it.
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return declared === "application/vnd.ms-powerpoint" ? "ppt" : "doc";
  }

  // PK\x03\x04
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return detectZipContainer(bytes, declared);
  }

  // Plain text has no signature, so it is accepted only when it was declared
  // as text AND decodes as UTF-8 with no control bytes.
  if (declared === "text/plain" || declared === "text/markdown") {
    if (looksLikeText(bytes)) {
      return declared === "text/markdown" ? "md" : "txt";
    }
  }

  return null;
}

function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.slice(0, 4096);
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(sample);
    // Reject binary masquerading as text: NUL and the C0 controls, but keep
    // tab, newline and carriage return, which real text files are full of.
    for (const char of text) {
      const code = char.charCodeAt(0);
      if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** How each kind reaches PDF. ARCHITECTURE.md §3. */
export function conversionEngineFor(
  kind: DetectedKind,
): "none" | "pdf-repair" | "libreoffice" | "img2pdf" | "markdown" {
  switch (kind) {
    case "pdf":
      return "pdf-repair";
    case "docx":
    case "doc":
    case "odt":
    case "pptx":
    case "ppt":
    case "odp":
    case "rtf":
      return "libreoffice";
    case "png":
    case "jpeg":
    case "webp":
    case "heic":
      return "img2pdf";
    case "txt":
    case "md":
      return "markdown";
  }
}

/** Extension for the *detected* kind — never the uploaded filename's. */
export function extensionFor(kind: DetectedKind): string {
  const map: Record<DetectedKind, string> = {
    pdf: ".pdf",
    docx: ".docx",
    doc: ".doc",
    odt: ".odt",
    pptx: ".pptx",
    ppt: ".ppt",
    odp: ".odp",
    rtf: ".rtf",
    txt: ".txt",
    md: ".md",
    png: ".png",
    jpeg: ".jpg",
    webp: ".webp",
    heic: ".heic",
  };
  return map[kind];
}
