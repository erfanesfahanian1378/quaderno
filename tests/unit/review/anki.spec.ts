import { describe, expect, it } from "vitest";
import { ANKI_FIELDS, ankiFileName, toAnkiTsv } from "@/lib/export/anki";

/**
 * PHASE-15 acceptance criterion:
 *
 *   "The TSV export imports into Anki with fields in the right order."
 *
 * Anki's importer has no escaping. A tab inside a field shifts every field
 * after it; a newline splits one card into two. Both fail silently — the
 * import succeeds and the deck is quietly wrong — which is why they are
 * tested here rather than trusted.
 */
describe("Anki TSV", () => {
  const rows = [
    {
      front: "il libro",
      back: "the book",
      example: "Leggo il libro.",
      note: "m.",
      tags: ["quaderno", "italiano"],
    },
  ];

  it("declares the separator, so Anki does not guess it", () => {
    const tsv = toAnkiTsv(rows);
    expect(tsv.split("\n")[0]).toBe("#separator:tab");
  });

  it("names the columns in the order the fields are written", () => {
    const tsv = toAnkiTsv(rows);
    const header = tsv.split("\n").find((line) => line.startsWith("#columns:"));

    expect(header).toBe(`#columns:${ANKI_FIELDS.join("\t")}\tTags`);

    const record = tsv.split("\n").find((line) => !line.startsWith("#"));
    expect(record?.split("\t")).toEqual([
      "il libro",
      "the book",
      "Leggo il libro.",
      "m.",
      "quaderno italiano",
    ]);
  });

  it("keeps every record on exactly one line", () => {
    const tsv = toAnkiTsv([
      {
        front: "una frase",
        back: "a sentence\nwith a newline",
        example: "line one\r\nline two",
        note: null,
      },
    ]);

    const records = tsv
      .split("\n")
      .filter((line) => line && !line.startsWith("#"));
    expect(records).toHaveLength(1);
    expect(records[0]?.split("\t")).toHaveLength(5);
  });

  it("keeps a tab inside a field from shifting the columns", () => {
    const tsv = toAnkiTsv([
      { front: "a\tb", back: "c", example: null, note: null },
    ]);
    const record = tsv.split("\n").find((line) => !line.startsWith("#"))!;

    expect(record.split("\t")).toEqual(["a b", "c", "", "", ""]);
  });

  it("writes empty cells rather than dropping the columns", () => {
    const tsv = toAnkiTsv([
      { front: "solo", back: "alone", example: null, note: null },
    ]);
    const record = tsv.split("\n").find((line) => !line.startsWith("#"))!;
    expect(record.split("\t")).toHaveLength(5);
  });

  it("keeps a space inside a tag from becoming two tags", () => {
    const tsv = toAnkiTsv([
      { front: "a", back: "b", tags: ["passato prossimo"] },
    ]);
    const record = tsv.split("\n").find((line) => !line.startsWith("#"))!;
    expect(record.split("\t")[4]).toBe("passato-prossimo");
  });

  it("turns HTML off, so a note containing < is not eaten", () => {
    expect(toAnkiTsv(rows)).toContain("#html:false");
  });
});

describe("ankiFileName", () => {
  it("strips accents and punctuation and collapses spaces", () => {
    expect(ankiFileName("Italiano — Lezione 1")).toBe(
      "Italiano-Lezione-1-anki.tsv",
    );
    // Accents fold to ASCII rather than being dropped with the letter.
    expect(ankiFileName("Però così")).toBe("Pero-cosi-anki.tsv");
  });

  it("never produces an empty name", () => {
    expect(ankiFileName("///")).toBe("quaderno-anki.tsv");
  });
});
