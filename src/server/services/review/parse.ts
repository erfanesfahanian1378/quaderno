/**
 * Vocabulary tables → review cards.
 *
 * The design constraint that shapes everything here: **the table is the source
 * of truth and the learner keeps editing it.** There is no card editor, so a
 * sync must reconcile rather than replace. Deleting and recreating on every
 * save would reset everyone's review history the first time they fixed a typo.
 */

export type ParsedRow = {
  /** Position in the table, 0-based, counting only non-empty rows. */
  row: number;
  /** Identity. Stable across edits to every other cell. */
  rowKey: string;
  front: string;
  back: string;
  example: string | null;
  note: string | null;
};

export type ParsedTable = {
  /** The nearest heading above the table, for labelling a deck. */
  heading: string | null;
  rows: ParsedRow[];
};

/*
 * Which tables count.
 *
 * A vocabulary table is recognised by its first two column headers. The
 * shipped template is Italian, but a learner renames headers to whatever
 * language they think in, so this covers the ones a language app is likely to
 * meet rather than pretending Italian is the only case.
 *
 * A table that does not match is left alone. That is deliberate: the
 * conjugation template's grid has an empty first header cell and person names
 * down the side, and turning that into word/translation pairs would produce
 * nonsense cards.
 */
const FRONT_HEADERS = [
  "word",
  "words",
  "term",
  "vocab",
  "vocabulary",
  "parola",
  "parole",
  "vocabolo",
  "lemma",
  "palabra",
  "palabras",
  "termino",
  "mot",
  "mots",
  "terme",
  "wort",
  "worter",
  "begriff",
  "palavra",
  "kelime",
  "woord",
  "ord",
];

const BACK_HEADERS = [
  "translation",
  "meaning",
  "definition",
  "english",
  "gloss",
  "traduzione",
  "significato",
  "traduccion",
  "significado",
  "traduction",
  "signification",
  "ubersetzung",
  "bedeutung",
  "traducao",
  "ceviri",
  "vertaling",
  "oversettelse",
];

const EXAMPLE_HEADERS = [
  "example",
  "sentence",
  "usage",
  "esempio",
  "frase",
  "ejemplo",
  "oracion",
  "exemple",
  "phrase",
  "beispiel",
  "satz",
  "exemplo",
  "ornek",
  "voorbeeld",
];

const NOTE_HEADERS = [
  "note",
  "notes",
  "remark",
  "remarks",
  "hint",
  "nota",
  "note",
  "appunti",
  "osservazioni",
  "notas",
  "remarque",
  "notiz",
  "anmerkung",
  "not",
];

/**
 * Fold a header for comparison: lowercase, strip accents, drop everything that
 * is not a letter. "Traduzione" and "traducción" both reduce to something the
 * lists above can match without needing every accented spelling.
 */
function foldHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function matches(header: string, vocabulary: string[]): boolean {
  const folded = foldHeader(header);
  if (!folded) return false;
  return vocabulary.some(
    (candidate) => folded === candidate || folded.startsWith(candidate),
  );
}

/**
 * The identity of a row.
 *
 * Case and spacing are noise — "il libro" and "Il  libro" are the same card,
 * and a learner tidying capitalisation should not lose their streak. Accents
 * are NOT stripped: `però` and `pero` are different Italian words, and merging
 * them would be worse than a lost streak.
 */
export function rowKeyFor(front: string): string {
  return front.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Splits one markdown table row into trimmed cells. */
function cells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

/**
 * Every vocabulary table in a markdown document.
 *
 * Hand-written rather than pulling in a markdown parser: the input is a table
 * this app generated from its own template, and the whole job is nine lines of
 * pipe splitting. A parser would be a dependency and an AST walk for the same
 * answer.
 */
export function parseVocabularyTables(markdown: string): ParsedTable[] {
  const lines = markdown.split(/\r?\n/);
  const tables: ParsedTable[] = [];

  let heading: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    const headingMatch = /^\s*#{1,6}\s+(.*\S)\s*$/.exec(line);
    if (headingMatch) {
      heading = headingMatch[1] ?? null;
      continue;
    }

    if (!line.includes("|")) continue;
    if (!isSeparator(lines[index + 1] ?? "")) continue;

    const header = cells(line);
    const frontAt = header.findIndex((cell) => matches(cell, FRONT_HEADERS));
    const backAt = header.findIndex((cell) => matches(cell, BACK_HEADERS));

    // Both are required. A single-column list of words with no translations
    // is not something you can be quizzed on.
    if (frontAt === -1 || backAt === -1 || frontAt === backAt) {
      index += 1;
      continue;
    }

    const exampleAt = header.findIndex((cell) =>
      matches(cell, EXAMPLE_HEADERS),
    );
    const noteAt = header.findIndex((cell) => matches(cell, NOTE_HEADERS));

    const rows: ParsedRow[] = [];
    const seen = new Map<string, number>();

    let cursor = index + 2;
    for (; cursor < lines.length; cursor += 1) {
      const rowLine = lines[cursor] ?? "";
      if (!rowLine.includes("|") || !rowLine.trim()) break;

      const row = cells(rowLine);
      const front = row[frontAt] ?? "";
      const back = row[backAt] ?? "";

      // The template ships with eight blank rows. Blank front or blank back
      // is not a card, it is a row waiting to be filled in.
      if (!front || !back) continue;

      const base = rowKeyFor(front);
      /*
       * Two rows can legitimately hold the same word — a noun and a verb that
       * are spelled alike, or the same word in two senses. The key has to stay
       * unique within the page, so the second occurrence is suffixed. It is
       * stable as long as their order relative to each other does not change,
       * which is the best that can be done without asking the user to
       * disambiguate.
       */
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);

      rows.push({
        row: rows.length,
        rowKey: count === 0 ? base : `${base} #${count + 1}`,
        front,
        back,
        example: exampleAt === -1 ? null : (row[exampleAt] ?? "") || null,
        note: noteAt === -1 ? null : (row[noteAt] ?? "") || null,
      });
    }

    if (rows.length > 0) tables.push({ heading, rows });
    index = cursor - 1;
  }

  return tables;
}

/** Every card-worthy row on a page, across all of its vocabulary tables. */
export function parseCards(markdown: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (const table of parseVocabularyTables(markdown)) {
    for (const row of table.rows) {
      rows.push({ ...row, row: rows.length });
    }
  }

  /*
   * Keys must be unique per PAGE, not per table — the unique constraint is
   * (notePageId, rowKey). Two tables on one page can both contain "il libro".
   */
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const count = seen.get(row.rowKey) ?? 0;
    seen.set(row.rowKey, count + 1);
    return count === 0
      ? row
      : { ...row, rowKey: `${row.rowKey} (${count + 1})` };
  });
}
