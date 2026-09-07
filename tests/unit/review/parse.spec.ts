import { describe, expect, it } from "vitest";
import {
  parseCards,
  parseVocabularyTables,
  rowKeyFor,
} from "@/server/services/review/parse";
import { TEMPLATES } from "@/server/services/composition/templates";

const FILLED = `## Vocabolario

| Parola | Traduzione | Esempio | Note |
| --- | --- | --- | --- |
| il libro | the book | Leggo il libro. | m. |
| la casa | the house | La casa è grande. |  |
| però | however | Però non voglio. | accento |
`;

describe("parseVocabularyTables", () => {
  it("reads a filled-in vocabulary table", () => {
    const [table] = parseVocabularyTables(FILLED);

    expect(table?.heading).toBe("Vocabolario");
    expect(table?.rows).toHaveLength(3);
    expect(table?.rows[0]).toMatchObject({
      row: 0,
      rowKey: "il libro",
      front: "il libro",
      back: "the book",
      example: "Leggo il libro.",
      note: "m.",
    });
  });

  it("treats an empty cell as absent rather than as an empty string", () => {
    const [table] = parseVocabularyTables(FILLED);
    expect(table?.rows[1]?.note).toBeNull();
  });

  it("produces nothing from the shipped template until it is filled in", () => {
    // Eight blank rows. A learner who inserts the template and walks away
    // should not acquire eight empty cards.
    expect(parseCards(TEMPLATES.vocabulary.content)).toEqual([]);
  });

  it("ignores the conjugation grid", () => {
    // Its first header cell is empty and its rows are persons, not words.
    // Turning it into cards would produce "io" → "parlo, ho parlato, ...".
    expect(parseCards(TEMPLATES.conjugation.content)).toEqual([]);
  });

  it("ignores the Cornell template's questions table", () => {
    expect(parseCards(TEMPLATES.cornell.content)).toEqual([]);
  });

  it("requires both a front and a back column", () => {
    const oneColumn = `| Parola |\n| --- |\n| il libro |\n`;
    expect(parseCards(oneColumn)).toEqual([]);
  });

  it("skips rows missing either side", () => {
    const partial = `| Word | Translation |
| --- | --- |
| il libro | the book |
| la casa |  |
|  | the door |
`;
    expect(parseCards(partial).map((row) => row.front)).toEqual(["il libro"]);
  });

  it("recognises headers in the languages a learner is likely to use", () => {
    for (const header of [
      "| Word | Translation |",
      "| Parola | Traduzione |",
      "| Palabra | Traducción |",
      "| Mot | Traduction |",
      "| Wort | Übersetzung |",
    ]) {
      const markdown = `${header}\n| --- | --- |\n| a | b |\n`;
      expect(parseCards(markdown), header).toHaveLength(1);
    }
  });

  it("finds every table on the page and numbers rows across them", () => {
    const two = `## One

| Word | Translation |
| --- | --- |
| uno | one |

## Two

| Word | Translation |
| --- | --- |
| due | two |
`;
    expect(parseCards(two).map((row) => [row.row, row.front])).toEqual([
      [0, "uno"],
      [1, "due"],
    ]);
  });

  it("keeps keys unique when the same word appears twice", () => {
    const duplicated = `| Word | Translation |
| --- | --- |
| stato | been (essere) |
| stato | state (noun) |
`;
    const keys = parseCards(duplicated).map((row) => row.rowKey);
    expect(new Set(keys).size).toBe(2);
    expect(keys[0]).toBe("stato");
  });

  it("tolerates tables written without outer pipes", () => {
    const loose = `Word | Translation
--- | ---
il libro | the book
`;
    expect(parseCards(loose)).toHaveLength(1);
  });
});

describe("rowKeyFor", () => {
  it("ignores case and spacing, which are noise", () => {
    expect(rowKeyFor("  Il  Libro ")).toBe(rowKeyFor("il libro"));
  });

  it("keeps accents, which are not", () => {
    // `però` (however) and `pero` (pear tree) are different words. Folding
    // them together would merge two cards and lose one of them.
    expect(rowKeyFor("però")).not.toBe(rowKeyFor("pero"));
  });
});
