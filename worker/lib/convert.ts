import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { run, isAvailable } from "./run";

/**
 * Conversion to PDF. **PDF is the universal substrate** (ARCHITECTURE.md §3):
 * everything becomes a PDF at ingest, so the annotation engine only ever has
 * to understand one format and there is no second-class file type.
 */

export type ConversionOutcome = {
  pdf: Uint8Array;
  engine: string;
  ms: number;
  log: string[];
};

export class ConversionError extends Error {
  readonly log: string[];
  constructor(message: string, log: string[] = []) {
    super(message);
    this.name = "ConversionError";
    this.log = log;
  }
}

async function withTempDir<T>(
  prefix: string,
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * PDF in, repaired PDF out. `qpdf --decrypt --linearize` removes owner
 * passwords we are allowed to remove, and linearising is what makes byte-range
 * requests work — the viewer opens page 1 of a 200-page file in ~100 KB
 * because of this step.
 *
 * When qpdf is missing (a developer machine without it), the original bytes
 * pass through unchanged rather than failing the upload.
 */
export async function repairPdf(
  input: Uint8Array,
  timeoutMs: number,
): Promise<ConversionOutcome> {
  const log: string[] = [];

  if (!(await isAvailable("qpdf"))) {
    log.push("qpdf not on PATH — passing the original through unrepaired");
    return { pdf: input, engine: "none", ms: 0, log };
  }

  return withTempDir("quaderno-qpdf-", async (dir) => {
    const inPath = join(dir, "in.pdf");
    const outPath = join(dir, "out.pdf");
    await writeFile(inPath, input);

    const result = await run(
      "qpdf",
      ["--decrypt", "--linearize", inPath, outPath],
      { timeoutMs, nice: 10 },
    );

    log.push(`qpdf exit=${result.code} ms=${result.ms}`);
    if (result.stderr.trim()) log.push(`qpdf stderr: ${result.stderr.trim()}`);

    // qpdf exits 3 on warnings but still writes valid output.
    if (result.code === 0 || result.code === 3) {
      try {
        return {
          pdf: new Uint8Array(await readFile(outPath)),
          engine: "pdf-repair",
          ms: result.ms,
          log,
        };
      } catch {
        log.push("qpdf produced no output — using the original");
      }
    }

    if (result.timedOut) {
      throw new ConversionError("The PDF took too long to process.", log);
    }

    // An encrypted PDF we cannot decrypt is still readable by pdf.js in many
    // cases, so pass it through rather than failing the upload outright.
    log.push("qpdf failed — passing the original through");
    return { pdf: input, engine: "none", ms: result.ms, log };
  });
}

/**
 * Office formats via headless LibreOffice.
 *
 * Every guard here is deliberate and is described in ARCHITECTURE.md §3:
 * a one-shot subprocess (never resident), `nice -n 10`, a hard SIGKILL at the
 * timeout, and an **isolated UserInstallation profile per job** so parallel or
 * crashed runs cannot corrupt a shared profile — which is the failure mode
 * that turns one bad document into every subsequent conversion failing.
 */
export async function convertWithLibreOffice(
  input: Uint8Array,
  extension: string,
  timeoutMs: number,
): Promise<ConversionOutcome> {
  const log: string[] = [];

  const binary = await findSoffice();

  if (!binary) {
    throw new ConversionError(
      "LibreOffice is not installed on this server, so Office files cannot be converted yet. The original file is still saved and downloadable.",
      ["soffice not found on PATH or in the usual macOS app bundle"],
    );
  }

  return withTempDir("quaderno-lo-", async (dir) => {
    const inPath = join(dir, `in${extension}`);
    const profileDir = join(dir, "profile");
    await writeFile(inPath, input);

    const result = await run(
      binary,
      [
        "--headless",
        "--norestore",
        "--nolockcheck",
        `-env:UserInstallation=file://${profileDir}`,
        "--convert-to",
        "pdf",
        "--outdir",
        dir,
        inPath,
      ],
      { timeoutMs, nice: 10, cwd: dir },
    );

    log.push(`${binary} exit=${result.code} ms=${result.ms}`);
    if (result.stdout.trim()) log.push(result.stdout.trim());
    if (result.stderr.trim()) log.push(`stderr: ${result.stderr.trim()}`);

    if (result.timedOut) {
      throw new ConversionError(
        "That document took too long to convert and was stopped.",
        log,
      );
    }

    try {
      const pdf = new Uint8Array(await readFile(join(dir, "in.pdf")));
      return { pdf, engine: "libreoffice", ms: result.ms, log };
    } catch {
      throw new ConversionError(
        "LibreOffice could not read that file. The original is still saved and downloadable.",
        log,
      );
    }
  });
}

/**
 * Locates LibreOffice.
 *
 * The macOS cask does NOT put `soffice` on PATH — it installs an app bundle
 * and leaves the binary at
 * `/Applications/LibreOffice.app/Contents/MacOS/soffice`. A plain
 * `which soffice` therefore reports "not installed" on a machine where it is
 * perfectly well installed, and the user gets told to install something they
 * already have. The Linux images do put it on PATH, so both are checked.
 */
async function findSoffice(): Promise<string | null> {
  for (const candidate of ["soffice", "libreoffice"]) {
    if (await isAvailable(candidate)) return candidate;
  }

  const bundled = [
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    `${process.env.HOME ?? ""}/Applications/LibreOffice.app/Contents/MacOS/soffice`,
    "/opt/homebrew/bin/soffice",
    "/usr/local/bin/soffice",
  ];

  for (const path of bundled) {
    if (path && existsSync(path)) return path;
  }

  return null;
}

/**
 * Images to PDF, one page per image, sized to the image's own aspect ratio so
 * nothing is letterboxed or stretched.
 */
export async function convertImage(
  input: Uint8Array,
  kind: "png" | "jpeg" | "webp" | "heic",
): Promise<ConversionOutcome> {
  const startedAt = Date.now();
  const log: string[] = [];

  // sharp normalises everything — including HEIC, which pdf-lib cannot embed —
  // to a PNG that pdf-lib can.
  const sharp = (await import("sharp")).default;
  const normalised = await sharp(Buffer.from(input))
    .rotate() // honour EXIF orientation; a photo of a whiteboard is often rotated
    .png()
    .toBuffer();

  const meta = await sharp(normalised).metadata();
  log.push(`sharp ${kind} -> png ${meta.width}x${meta.height}`);

  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(normalised);

  // A4 at 72dpi is 595x842. Fit the image inside it, keeping the ratio, so a
  // phone photo and a scan both land on a sane page.
  const maxWidth = 595;
  const maxHeight = 842;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;

  const page = pdf.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });

  return {
    pdf: await pdf.save(),
    engine: "img2pdf",
    ms: Date.now() - startedAt,
    log,
  };
}

/**
 * Plain text and markdown to PDF.
 *
 * A small typesetter over pdf-lib rather than a headless browser
 * (ANNOTATION_ENGINE.md §8 is explicit about not pulling one in). Handles the
 * subset that matters for notes: headings, paragraphs, lists, and code.
 */
export async function convertText(
  input: Uint8Array,
  isMarkdown: boolean,
): Promise<ConversionOutcome> {
  const startedAt = Date.now();
  const text = new TextDecoder("utf-8").decode(input);
  const { typesetToPdf } = await import("./typeset");
  const pdf = await typesetToPdf(text, { markdown: isMarkdown });

  return {
    pdf,
    engine: "markdown",
    ms: Date.now() - startedAt,
    log: [`typeset ${text.length} chars`],
  };
}

/** Page count and whether the PDF carries a real text layer. */
export async function probePdf(
  pdf: Uint8Array,
): Promise<{ pageCount: number; hasTextLayer: boolean }> {
  const document = await PDFDocument.load(pdf, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const pageCount = document.getPageCount();

  /*
   * Whether the file carries a real text layer, which is what drives the OCR
   * offer in the viewer.
   *
   * Two approaches that do NOT work, both tried:
   *   - searching raw bytes for text-showing operators (Tj/TJ): content
   *     streams are Flate-compressed, so those bytes are not in the file;
   *   - searching raw bytes for /BaseFont: modern writers (pdf-lib included)
   *     put font dictionaries inside compressed OBJECT streams, so they are
   *     not in the raw bytes either.
   *
   * So the resource dictionary is actually parsed. A page that declares any
   * font has text on it; a pure scan declares only image XObjects.
   */
  let hasTextLayer = false;

  for (const page of document.getPages()) {
    const resources = page.node.Resources();
    if (!resources) continue;

    const fonts = resources.lookupMaybe(PDFName.of("Font"), PDFDict);
    if (fonts && fonts.keys().length > 0) {
      hasTextLayer = true;
      break;
    }
  }

  return { pageCount, hasTextLayer };
}
