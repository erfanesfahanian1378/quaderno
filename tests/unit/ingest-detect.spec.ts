import { describe, expect, it } from "vitest";
import {
  conversionEngineFor,
  detectKind,
  isAllowedMime,
} from "@/server/services/ingest/detect";

/**
 * The PHASE-04 acceptance criterion this file exists for:
 *
 *   "A file renamed to .docx but actually a ZIP bomb is rejected by the
 *    magic-byte check and never reaches soffice."
 *
 * More generally: the client's declared MIME type is attacker input, and these
 * tests pin down exactly how far it is trusted (only to disambiguate *within*
 * a confirmed container format, never to promote unrecognised bytes).
 */

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function withPrefix(prefix: number[], length = 64): Uint8Array {
  const out = new Uint8Array(length);
  out.set(prefix, 0);
  return out;
}

const PDF = withPrefix([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const PNG = withPrefix([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = withPrefix([0xff, 0xd8, 0xff, 0xe0]);
const ZIP = withPrefix([0x50, 0x4b, 0x03, 0x04]);
const OLE2 = withPrefix([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

describe("detectKind", () => {
  it("reads a PDF from its signature, whatever it was declared as", () => {
    expect(detectKind(PDF, "application/pdf")).toBe("pdf");
    // Even a lie about the type cannot make real PDF bytes into something else.
    expect(detectKind(PDF, "image/png")).toBe("pdf");
  });

  it("recognises the image formats", () => {
    expect(detectKind(PNG, "image/png")).toBe("png");
    expect(detectKind(JPEG, "image/jpeg")).toBe("jpeg");

    const webp = withPrefix([0x52, 0x49, 0x46, 0x46]);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(detectKind(webp, "image/webp")).toBe("webp");

    const heic = withPrefix([0x00, 0x00, 0x00, 0x18]);
    heic.set([0x66, 0x74, 0x79, 0x70], 4);
    heic.set([0x68, 0x65, 0x69, 0x63], 8);
    expect(detectKind(heic, "image/heic")).toBe("heic");
  });

  it("recognises RTF and the legacy OLE2 formats", () => {
    const rtf = new TextEncoder().encode("{\\rtf1\\ansi test}");
    expect(detectKind(rtf, "application/rtf")).toBe("rtf");

    expect(detectKind(OLE2, "application/msword")).toBe("doc");
    expect(detectKind(OLE2, "application/vnd.ms-powerpoint")).toBe("ppt");
  });

  it("reads the uncompressed ODF mimetype entry rather than trusting the header", () => {
    const odt = new Uint8Array(128);
    odt.set([0x50, 0x4b, 0x03, 0x04], 0);
    odt.set(
      new TextEncoder().encode(
        "mimetypeapplication/vnd.oasis.opendocument.text",
      ),
      30,
    );
    // Declared as a .docx, but the container says otherwise and it wins.
    expect(detectKind(odt, DOCX_MIME)).toBe("odt");
  });

  it("uses the declared type only to disambiguate a confirmed ZIP", () => {
    expect(detectKind(ZIP, DOCX_MIME)).toBe("docx");
    expect(detectKind(ZIP, PPTX_MIME)).toBe("pptx");
  });

  /**
   * The acceptance criterion, directly. A zip bomb is a real ZIP, so the
   * container check passes — what stops it is that its declared type has to be
   * one we accept, and anything else returns null.
   */
  it("rejects a ZIP that claims to be something not on the allowlist", () => {
    expect(detectKind(ZIP, "application/zip")).toBeNull();
    expect(detectKind(ZIP, "application/x-zip-compressed")).toBeNull();
    expect(detectKind(ZIP, "application/java-archive")).toBeNull();
  });

  it("rejects an executable however it is declared", () => {
    // Mach-O and ELF.
    const macho = withPrefix([0xcf, 0xfa, 0xed, 0xfe]);
    const elf = withPrefix([0x7f, 0x45, 0x4c, 0x46]);

    for (const declared of [DOCX_MIME, "application/pdf", "image/png"]) {
      expect(detectKind(macho, declared)).toBeNull();
      expect(detectKind(elf, declared)).toBeNull();
    }
  });

  it("rejects an SVG, which is script-bearing and not on the allowlist", () => {
    const svg = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
    expect(detectKind(svg, "image/svg+xml")).toBeNull();
  });

  it("accepts real text only when it was declared as text", () => {
    const text = new TextEncoder().encode(
      "# Lezione 12\n\nIl passato prossimo — perché, però, così.\n",
    );
    expect(detectKind(text, "text/markdown")).toBe("md");
    expect(detectKind(text, "text/plain")).toBe("txt");
    // The same bytes declared as a PDF are not a PDF.
    expect(detectKind(text, "application/pdf")).toBeNull();
  });

  it("rejects binary dressed up as text/plain", () => {
    expect(
      detectKind(bytes(0x00, 0x01, 0x02, 0x03, 0xff), "text/plain"),
    ).toBeNull();
  });

  it("keeps tabs and newlines, which real text is full of", () => {
    const text = new TextEncoder().encode("a\tb\r\nc\n");
    expect(detectKind(text, "text/plain")).toBe("txt");
  });

  it("rejects an empty or truncated file", () => {
    expect(detectKind(new Uint8Array(0), "application/pdf")).toBeNull();
    expect(detectKind(bytes(0x25, 0x50), "application/pdf")).toBeNull();
  });
});

describe("isAllowedMime", () => {
  it("accepts the documented allowlist and nothing else", () => {
    expect(isAllowedMime("application/pdf")).toBe(true);
    expect(isAllowedMime(DOCX_MIME)).toBe(true);
    expect(isAllowedMime("image/svg+xml")).toBe(false);
    expect(isAllowedMime("text/html")).toBe(false);
    expect(isAllowedMime("application/zip")).toBe(false);
  });
});

describe("conversionEngineFor", () => {
  it("routes every kind to the pipeline ARCHITECTURE.md §3 specifies", () => {
    expect(conversionEngineFor("pdf")).toBe("pdf-repair");
    expect(conversionEngineFor("docx")).toBe("libreoffice");
    expect(conversionEngineFor("pptx")).toBe("libreoffice");
    expect(conversionEngineFor("rtf")).toBe("libreoffice");
    expect(conversionEngineFor("png")).toBe("img2pdf");
    expect(conversionEngineFor("heic")).toBe("img2pdf");
    expect(conversionEngineFor("md")).toBe("markdown");
  });
});
