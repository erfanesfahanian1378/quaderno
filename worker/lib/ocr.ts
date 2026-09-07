import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isAvailable, run } from "./run";

/**
 * OCR via ocrmypdf. PHASE-11.
 *
 * It shells out to Ghostscript and Tesseract and is every bit as
 * memory-hungry as LibreOffice, so it gets the same treatment: `nice -n 10`,
 * a hard SIGKILL, and **queue concurrency 1**. The 2 GB budget in
 * ARCHITECTURE.md §6 does not care that this is a different binary.
 */

export class OcrError extends Error {
  readonly log: string[];
  constructor(message: string, log: string[] = []) {
    super(message);
    this.name = "OcrError";
    this.log = log;
  }
}

/**
 * ISO 639-1 → Tesseract's three-letter codes. Only the packs actually
 * installed in the worker image are listed; anything else falls back to
 * English, and the caller says so rather than pretending.
 */
const TESSERACT_LANGUAGES: Record<string, string> = {
  it: "ita",
  fr: "fra",
  de: "deu",
  es: "spa",
  en: "eng",
  pt: "por",
  nl: "nld",
};

export function tesseractLanguage(code: string): {
  language: string;
  exact: boolean;
} {
  const mapped = TESSERACT_LANGUAGES[code.toLowerCase()];
  return mapped
    ? { language: mapped, exact: true }
    : { language: "eng", exact: false };
}

export async function ocrAvailable(): Promise<boolean> {
  return isAvailable("ocrmypdf");
}

/**
 * Which language packs Tesseract actually has.
 *
 * Asking first, rather than running and parsing the failure, is the
 * difference between "OCR could not read that document" — which tells the
 * user nothing they can act on — and "Italian is not installed, so this was
 * read as English". Homebrew's tesseract ships `eng` only; the rest come from
 * the separate `tesseract-lang` formula.
 */
export async function installedLanguages(): Promise<Set<string>> {
  const result = await run("tesseract", ["--list-langs"], { timeoutMs: 8000 });
  if (result.code !== 0) return new Set(["eng"]);

  return new Set(
    // The first line is a header; the rest are codes.
    result.stdout
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

export async function ocrPdf(
  input: Uint8Array,
  languageCode: string,
  timeoutMs: number,
): Promise<{
  pdf: Uint8Array;
  language: string;
  exact: boolean;
  ms: number;
  log: string[];
}> {
  const log: string[] = [];

  if (!(await ocrAvailable())) {
    throw new OcrError(
      "OCR is not available on this server yet. The document is unchanged.",
      ["ocrmypdf not found on PATH"],
    );
  }

  const requested = tesseractLanguage(languageCode);
  const installed = await installedLanguages();

  // Fall back rather than fail: reading a scan as English is imperfect but
  // far better than not reading it, and the log says exactly what happened.
  let language = requested.language;
  let exact = requested.exact;

  if (!installed.has(language)) {
    log.push(
      `Tesseract has no "${language}" pack (installed: ${[...installed].join(", ")}) — reading as English instead, so accented characters may be wrong`,
    );
    language = installed.has("eng") ? "eng" : ([...installed][0] ?? "eng");
    exact = false;
  } else if (!requested.exact) {
    log.push(
      `no Tesseract mapping for "${languageCode}" — reading as ${language}`,
    );
  }

  const dir = await mkdtemp(join(tmpdir(), "quaderno-ocr-"));

  try {
    const inPath = join(dir, "in.pdf");
    const outPath = join(dir, "out.pdf");
    await writeFile(inPath, input);

    const result = await run(
      "ocrmypdf",
      [
        // Leaves pages that already have text alone. This is what makes the
        // job safe on a mixed document and safe to re-run.
        "--skip-text",
        "--rotate-pages",
        "--deskew",
        // Level 1 only: higher levels invoke pngquant and jbig2 and can
        // double the runtime for a few percent of size.
        "--optimize",
        "1",
        "--language",
        language,
        "--quiet",
        inPath,
        outPath,
      ],
      { timeoutMs, nice: 10, cwd: dir },
    );

    log.push(`ocrmypdf exit=${result.code} ms=${result.ms} lang=${language}`);
    if (result.stderr.trim()) log.push(`stderr: ${result.stderr.trim()}`);

    if (result.timedOut) {
      throw new OcrError(
        "OCR took too long and was stopped. The document is unchanged.",
        log,
      );
    }

    // 0 = ok. 2 = the file already had text on every page, which with
    // --skip-text is a success, not a failure.
    if (result.code !== 0 && result.code !== 2) {
      // Surface the actual cause. A generic message here sends the user
      // looking in the wrong place.
      const detail = /language data/i.test(result.stderr)
        ? " A language pack is missing on the server."
        : /encrypted|password/i.test(result.stderr)
          ? " The PDF is password-protected."
          : "";

      throw new OcrError(
        `OCR could not read that document.${detail} It is unchanged and still usable.`,
        log,
      );
    }

    return {
      pdf: new Uint8Array(await readFile(outPath)),
      language,
      exact,
      ms: result.ms,
      log,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
