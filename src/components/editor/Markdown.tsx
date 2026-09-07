import { Fragment } from "react";

/**
 * Rendering a note page.
 *
 * The editor is a markdown textarea by design (see NotePageEditor) — but the
 * READ view was showing the same raw source, so a vocabulary page looked like
 *
 *     | Parola | Traduzione |
 *     | --- | --- |
 *
 * which is not a table anybody can fill in. The templates are mostly tables,
 * so a table is the one block that has to render properly.
 *
 * Hand-written rather than a markdown library, for the same reasons as
 * elsewhere in this codebase: the input is markdown this app generated from
 * its own templates, the subset is small, and building elements rather than
 * setting innerHTML means nothing a user types can become markup. Links and
 * images are deliberately absent — a note page has no need of them and a link
 * would be another href surface to validate.
 */

type Row = string[];

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; header: Row; rows: Row[] }
  | { kind: "rule" };

function cells(line: string): Row {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.split(/\r?\n/);
  const blocks: Block[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (!line.trim()) continue;

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      continue;
    }

    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1]!.length,
        text: heading[2]!.trim(),
      });
      continue;
    }

    // A table is a header row followed by a separator. Without the separator
    // it is just a line containing pipes, which a note legitimately might be.
    if (line.includes("|") && isSeparator(lines[index + 1] ?? "")) {
      const header = cells(line);
      const rows: Row[] = [];

      let cursor = index + 2;
      for (; cursor < lines.length; cursor += 1) {
        const row = lines[cursor] ?? "";
        if (!row.trim() || !row.includes("|")) break;
        rows.push(cells(row));
      }

      blocks.push({ kind: "table", header, rows });
      index = cursor - 1;
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = numbered !== null;
      const items: string[] = [(bullet ?? numbered)![1]!];

      let cursor = index + 1;
      for (; cursor < lines.length; cursor += 1) {
        const next = lines[cursor] ?? "";
        const match = ordered
          ? /^\s*\d+[.)]\s+(.*)$/.exec(next)
          : /^\s*[-*+]\s+(.*)$/.exec(next);
        if (!match) break;
        items.push(match[1]!);
      }

      blocks.push({ kind: "list", ordered, items });
      index = cursor - 1;
      continue;
    }

    blocks.push({ kind: "paragraph", text: line.trim() });
  }

  return blocks;
}

/**
 * Inline `**bold**`, `*italic*` and `` `code` ``.
 *
 * One pass with a single alternating regex, so a `*` inside backticks is not
 * mistaken for emphasis.
 */
function Inline({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)/g;

  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));

    const token = match[0];
    key += 1;

    if (token.startsWith("`")) {
      parts.push(
        <code
          key={key}
          className="rounded-sm bg-subtle px-1 font-mono text-[0.9em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    last = match.index + token.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

const HEADING_CLASS: Record<number, string> = {
  1: "text-h1",
  2: "text-h2",
  3: "text-h3",
  4: "text-label",
  5: "text-label",
  6: "text-label",
};

export function Markdown({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const blocks = parseMarkdown(source);

  return (
    <div className={className}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "rule":
            return <hr key={index} className="my-3 border-t border-hairline" />;

          case "heading": {
            const Tag = `h${Math.min(block.level + 1, 6)}` as "h2";
            return (
              <Tag
                key={index}
                className={`mb-2 mt-3 font-reading ${HEADING_CLASS[block.level] ?? "text-label"} text-ink first:mt-0`}
              >
                <Inline text={block.text} />
              </Tag>
            );
          }

          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag
                key={index}
                className={`mb-2 ml-5 ${block.ordered ? "list-decimal" : "list-disc"}`}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="mb-0.5">
                    <Inline text={item} />
                  </li>
                ))}
              </Tag>
            );
          }

          case "table":
            return (
              /*
               * The table scrolls inside its own box. A vocabulary table with
               * four columns is wider than a phone, and letting it widen the
               * page would make the whole note scroll sideways.
               */
              <div key={index} className="mb-3 overflow-x-auto">
                <table className="w-full border-collapse text-[0.95em]">
                  <thead>
                    <tr>
                      {block.header.map((cell, cellIndex) => (
                        <th
                          key={cellIndex}
                          className="border border-hairline bg-subtle px-2 py-1 text-left font-medium text-ink-2"
                        >
                          <Inline text={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {block.header.map((_, cellIndex) => (
                          <td
                            key={cellIndex}
                            className="border border-hairline px-2 py-1 align-top text-ink"
                          >
                            {/* An empty cell still needs its height, or a
                                blank template row collapses to a line. */}
                            {row[cellIndex]?.trim() ? (
                              <Inline text={row[cellIndex]!} />
                            ) : (
                              <span className="inline-block min-h-[1.2em]">
                                &nbsp;
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          default:
            return (
              <p key={index} className="mb-2 text-ink">
                <Inline text={block.text} />
              </p>
            );
        }
      })}

      {blocks.length === 0 ? <Fragment /> : null}
    </div>
  );
}
