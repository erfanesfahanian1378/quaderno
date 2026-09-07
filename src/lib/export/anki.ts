/**
 * Anki export, as TSV.
 *
 * Not `.apkg`. That format is a zip around a SQLite database, which means
 * shipping sql.js — about 1.5 MB of WebAssembly — to build a file that Anki
 * will import from TSV anyway. TSV is twenty lines and imports natively;
 * `.apkg` is worth adding the day someone needs scheduling state to travel
 * with the cards, and not before.
 */

export type AnkiRow = {
  front: string;
  back: string;
  example?: string | null;
  note?: string | null;
  tags?: string[];
};

/**
 * Anki splits fields on tabs and records on newlines, and has no escaping —
 * so a tab inside a field silently shifts every field after it, and a newline
 * silently splits one card into two. Replacing them is the only correct
 * option; quoting is not a thing the importer understands.
 *
 * Tags are space-separated in Anki, so a space inside one would split it.
 */
function cell(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/[\t\r\n]+/g, " ").trim();
}

function tag(value: string): string {
  return value.replace(/\s+/g, "-").replace(/[^\p{L}\p{N}_-]/gu, "");
}

export const ANKI_FIELDS = ["Front", "Back", "Example", "Note"] as const;

/**
 * The header block Anki reads for import settings.
 *
 * `#separator:tab` matters: without it Anki guesses, and guesses commas for a
 * file whose first line happens to contain one. `#html:false` keeps a note
 * containing "<" from being swallowed as a tag.
 */
export function toAnkiTsv(rows: AnkiRow[], deckName?: string): string {
  const lines = [
    "#separator:tab",
    "#html:false",
    `#columns:${ANKI_FIELDS.join("\t")}\tTags`,
  ];

  if (deckName) lines.push(`#deck:${cell(deckName)}`);

  for (const row of rows) {
    lines.push(
      [
        cell(row.front),
        cell(row.back),
        cell(row.example),
        cell(row.note),
        (row.tags ?? []).map(tag).filter(Boolean).join(" "),
      ].join("\t"),
    );
  }

  return `${lines.join("\n")}\n`;
}

/** A filename that survives every filesystem, including a phone's. */
export function ankiFileName(label: string): string {
  const safe =
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "quaderno";
  return `${safe}-anki.tsv`;
}
