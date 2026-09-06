import { prisma } from "./client";
import type { Ctx } from "./base";

/**
 * Search. PHASE-09 §1.
 *
 * Everything goes through the `searchText` generated columns, which are
 * lower-cased and unaccented at write time. That is what makes `perche` find
 * `perché` and `etudier` find `étudier` — a requirement, not a nicety, in an
 * app for Italian and French, because a learner types without accents
 * constantly and often does not yet know where the accent goes.
 *
 * The query term is folded the same way, so both sides of the comparison are
 * in the same normal form.
 */

export type SearchHit = {
  type: "document" | "note" | "annotation" | "comment" | "class";
  id: string;
  documentId: string | null;
  title: string;
  snippet: string;
  /** Highlight colour token, when the hit is a highlight. */
  color?: string | null;
  languageId: string | null;
  createdAt: Date;
};

const LIMIT_PER_TYPE = 8;

export async function search(
  ctx: Ctx,
  term: string,
  languageId?: string,
): Promise<SearchHit[]> {
  const trimmed = term.trim();
  if (trimmed.length < 2) return [];

  // Fold the query exactly as the stored column was folded.
  const [folded] = await prisma.$queryRaw<{ q: string }[]>`
    SELECT quaderno_unaccent(lower(${trimmed})) AS q
  `;
  const needle = `%${folded?.q ?? trimmed.toLowerCase()}%`;

  const [documents, notes, annotations, comments, classes] = await Promise.all([
    prisma.$queryRaw<
      { id: string; title: string; languageId: string; createdAt: Date }[]
    >`
      SELECT "id", "title", "languageId", "createdAt"
      FROM "Document"
      WHERE "userId" = ${ctx.userId}
        AND "deletedAt" IS NULL
        -- An absent filter matches everything; a present one narrows.
        AND (${languageId ?? null}::text IS NULL OR "languageId" = ${languageId ?? null}::text)
        AND "searchText" LIKE ${needle}
      ORDER BY "updatedAt" DESC
      LIMIT ${LIMIT_PER_TYPE}
    `,

    prisma.$queryRaw<
      {
        id: string;
        content: string;
        documentId: string;
        title: string;
        languageId: string;
        updatedAt: Date;
      }[]
    >`
      SELECT n."id", n."content", d."id" AS "documentId", d."title",
             d."languageId", n."updatedAt"
      FROM "NotePage" n
      JOIN "Leaf" l ON l."notePageId" = n."id"
      JOIN "Document" d ON d."id" = l."documentId"
      WHERE d."userId" = ${ctx.userId}
        AND d."deletedAt" IS NULL
        AND n."searchText" LIKE ${needle}
      ORDER BY n."updatedAt" DESC
      LIMIT ${LIMIT_PER_TYPE}
    `,

    prisma.$queryRaw<
      {
        id: string;
        quotedText: string;
        color: string;
        documentId: string;
        title: string;
        languageId: string;
        createdAt: Date;
      }[]
    >`
      SELECT a."id", a."quotedText", a."color", d."id" AS "documentId",
             d."title", d."languageId", a."createdAt"
      FROM "Annotation" a
      JOIN "Document" d ON d."id" = a."documentId"
      WHERE a."userId" = ${ctx.userId}
        AND a."deletedAt" IS NULL
        AND a."searchText" LIKE ${needle}
      ORDER BY a."createdAt" DESC
      LIMIT ${LIMIT_PER_TYPE}
    `,

    prisma.$queryRaw<
      {
        id: string;
        body: string;
        documentId: string;
        title: string;
        languageId: string;
        createdAt: Date;
      }[]
    >`
      SELECT c."id", c."body", d."id" AS "documentId", d."title",
             d."languageId", c."createdAt"
      FROM "Comment" c
      JOIN "Document" d ON d."id" = c."documentId"
      WHERE c."userId" = ${ctx.userId}
        AND c."deletedAt" IS NULL
        AND c."searchText" LIKE ${needle}
      ORDER BY c."createdAt" DESC
      LIMIT ${LIMIT_PER_TYPE}
    `,

    prisma.$queryRaw<
      { id: string; title: string; languageId: string; date: Date }[]
    >`
      SELECT "id", "title", "languageId", "date"
      FROM "ClassSession"
      WHERE "userId" = ${ctx.userId}
        AND "searchText" LIKE ${needle}
      ORDER BY "date" DESC
      LIMIT ${LIMIT_PER_TYPE}
    `,
  ]);

  return [
    ...documents.map((row) => ({
      type: "document" as const,
      id: row.id,
      documentId: row.id,
      title: row.title,
      snippet: "",
      languageId: row.languageId,
      createdAt: row.createdAt,
    })),
    ...notes.map((row) => ({
      type: "note" as const,
      id: row.id,
      documentId: row.documentId,
      title: row.title,
      snippet: excerpt(row.content, trimmed),
      languageId: row.languageId,
      createdAt: row.updatedAt,
    })),
    ...annotations.map((row) => ({
      type: "annotation" as const,
      id: row.id,
      documentId: row.documentId,
      title: row.title,
      snippet: row.quotedText ?? "",
      color: row.color,
      languageId: row.languageId,
      createdAt: row.createdAt,
    })),
    ...comments.map((row) => ({
      type: "comment" as const,
      id: row.id,
      documentId: row.documentId,
      title: row.title,
      snippet: excerpt(row.body, trimmed),
      languageId: row.languageId,
      createdAt: row.createdAt,
    })),
    ...classes.map((row) => ({
      type: "class" as const,
      id: row.id,
      documentId: null,
      title: row.title,
      snippet: "",
      languageId: row.languageId,
      createdAt: row.date,
    })),
  ];
}

/**
 * A window of text around the match. Folds the haystack the same way to find
 * the position, so `perche` locates `perché` in the snippet too.
 */
function excerpt(text: string, term: string, radius = 60): string {
  const fold = (value: string) =>
    value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const index = fold(text).indexOf(fold(term));
  if (index < 0) return text.slice(0, radius * 2).trim();

  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + term.length + radius);

  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}
