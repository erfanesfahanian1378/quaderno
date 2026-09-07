import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { searchParams } from "@/server/api/request";
import { validationFailed } from "@/server/errors";
import * as review from "@/server/repositories/review";
import { ankiFileName, toAnkiTsv } from "@/lib/export/anki";

/**
 * Cards as an Anki-importable TSV. Scope it to a language, a document, or a
 * single note page — the three units a learner actually thinks in.
 */
export const GET = wrap(async (request) => {
  const ctx = await requireUser();
  const query = searchParams(request);

  const scope = {
    ...(query.get("languageId")
      ? { languageId: query.get("languageId")! }
      : {}),
    ...(query.get("documentId")
      ? { documentId: query.get("documentId")! }
      : {}),
    ...(query.get("notePageId")
      ? { notePageId: query.get("notePageId")! }
      : {}),
  };

  if (Object.keys(scope).length === 0) {
    throw validationFailed(
      "Choose a language, a document, or a page to export.",
    );
  }

  const cards = await review.forExport(ctx, scope);
  const label = query.get("label") ?? "quaderno";

  const tsv = toAnkiTsv(
    cards.map((card) => ({
      front: card.front,
      back: card.back,
      example: card.example,
      note: card.note,
      tags: ["quaderno"],
    })),
    label,
  );

  return new Response(tsv, {
    headers: {
      "Content-Type": "text/tab-separated-values; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ankiFileName(label)}"`,
    },
  });
});
