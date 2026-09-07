import { describe, expect, it } from "vitest";
import { parseMarkdown } from "@/components/editor/Markdown";
import { TEMPLATES } from "@/server/services/composition/templates";

/**
 * The note page renderer.
 *
 * The templates this app ships are mostly tables, and before this existed a
 * vocabulary page displayed its own markdown source — rows of pipes and
 * dashes. So the tables are what these tests are really about.
 */
describe("parsing a note page", () => {
  it("renders the vocabulary template as a table, not as pipes", () => {
    const blocks = parseMarkdown(TEMPLATES.vocabulary.content);

    const table = blocks.find((block) => block.kind === "table");
    expect(table).toBeDefined();
    expect(table).toMatchObject({
      header: ["Parola", "Traduzione", "Esempio", "Note"],
    });

    // The eight blank rows the template ships with are real rows: they are
    // what the learner types into.
    expect(table && "rows" in table ? table.rows.length : 0).toBe(8);
  });

  it("keeps the conjugation grid's empty first header cell", () => {
    const table = parseMarkdown(TEMPLATES.conjugation.content).find(
      (block) => block.kind === "table",
    );
    expect(table && "header" in table ? table.header[0] : "x").toBe("");
    expect(table && "header" in table ? table.header : []).toContain(
      "Presente",
    );
  });

  it("reads headings", () => {
    expect(parseMarkdown("## Vocabolario")[0]).toEqual({
      kind: "heading",
      level: 2,
      text: "Vocabolario",
    });
  });

  it("does not mistake a sentence containing a pipe for a table", () => {
    // Without the separator-line check, "a | b" becomes a one-row table and
    // the sentence disappears into a header cell.
    const blocks = parseMarkdown("passato prossimo | imperfetto");
    expect(blocks[0]?.kind).toBe("paragraph");
  });

  it("reads bullet and numbered lists", () => {
    expect(parseMarkdown("- one\n- two")[0]).toMatchObject({
      kind: "list",
      ordered: false,
      items: ["one", "two"],
    });
    expect(parseMarkdown("1. one\n2. two")[0]).toMatchObject({
      kind: "list",
      ordered: true,
      items: ["one", "two"],
    });
  });

  it("reads a horizontal rule, which the Cornell template uses", () => {
    expect(parseMarkdown("---")[0]).toEqual({ kind: "rule" });
    // But a table separator line on its own is still a rule, not a table.
    expect(parseMarkdown(TEMPLATES.cornell.content)).toContainEqual({
      kind: "rule",
    });
  });

  it("ends a table at the first blank line", () => {
    const blocks = parseMarkdown(
      "| a | b |\n| --- | --- |\n| 1 | 2 |\n\nAfter the table.",
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.kind).toBe("table");
    expect(blocks[1]).toEqual({ kind: "paragraph", text: "After the table." });
  });

  it("tolerates a row with fewer cells than the header", () => {
    // A learner deleting a trailing pipe must not lose the row.
    const blocks = parseMarkdown("| a | b | c |\n| --- | --- | --- |\n| 1 |");
    const table = blocks[0];
    expect(table?.kind).toBe("table");
    expect(table && "rows" in table ? table.rows[0] : []).toEqual(["1"]);
  });

  it("produces nothing from an empty page", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("\n\n  \n")).toEqual([]);
  });
});
