import { conflict, notFound } from "../../errors";
import type { Ctx } from "../../repositories/base";
import * as documents from "../../repositories/document";
import * as leaves from "../../repositories/leaf";
import * as courses from "../../repositories/course";
import { positionBetween, renumber } from "./position";
import { templateContent, type TemplateKey } from "./templates";

/**
 * Composition: inserting, moving and hiding leaves.
 *
 * This is the half of "add a page between notes" that is not in the annotation
 * engine (ANNOTATION_ENGINE.md §6). The uploaded file is never rewritten; only
 * the ordered list of leaves changes.
 */

export async function insertLeaf(
  ctx: Ctx,
  documentId: string,
  input: {
    afterLeafId?: string | null | undefined;
    template?: TemplateKey | undefined;
    label?: string | undefined;
  },
) {
  const document = await documents.findById(ctx, documentId);
  if (!document) throw notFound("Document");

  // `afterLeafId: null` prepends; undefined appends at the end.
  const afterLeafId =
    input.afterLeafId === undefined
      ? ((await lastLeafId(ctx, documentId)) ?? null)
      : input.afterLeafId;

  const { prev, next } = await leaves.neighbours(ctx, documentId, afterLeafId);

  let position = positionBetween(prev, next);

  if (position === null) {
    // The documented recovery: renumber the document, then try once more.
    await renumberDocument(ctx, documentId);
    const retry = await leaves.neighbours(ctx, documentId, afterLeafId);
    position = positionBetween(retry.prev, retry.next);
    if (position === null) {
      throw conflict("There is no room to insert a page there.");
    }
  }

  const created = await leaves.createNotePage(ctx, {
    documentId,
    position,
    content: templateContent(input.template),
    label: input.label,
  });

  if (!created) throw notFound("Document");
  return created;
}

export async function moveLeaf(
  ctx: Ctx,
  leafId: string,
  afterLeafId: string | null,
) {
  const leaf = await leaves.findById(ctx, leafId);
  if (!leaf) throw notFound("Page");

  const { prev, next } = await leaves.neighbours(
    ctx,
    leaf.documentId,
    afterLeafId,
  );

  let position = positionBetween(prev, next);
  if (position === null) {
    await renumberDocument(ctx, leaf.documentId);
    const retry = await leaves.neighbours(ctx, leaf.documentId, afterLeafId);
    position = positionBetween(retry.prev, retry.next);
    if (position === null) throw conflict("That page cannot move there.");
  }

  // One row. That is the whole point of fractional indexing.
  await leaves.move(ctx, leafId, position);
  return { position };
}

export async function hideLeaf(ctx: Ctx, leafId: string) {
  if (!(await leaves.hide(ctx, leafId))) throw notFound("Page");
}

/**
 * A NATIVE document: note pages only, no uploaded file. There is deliberately
 * no second code path — the viewer, the annotation layer, search and export
 * treat it exactly like an uploaded one (DATA_MODEL.md §1).
 */
export async function createNativeDocument(
  ctx: Ctx,
  input: {
    languageId: string;
    title: string;
    courseId?: string | undefined;
    classSessionId?: string | undefined;
    template?: TemplateKey | undefined;
  },
) {
  const courseId =
    input.courseId ??
    (await courses.findDefault(ctx, input.languageId))?.id ??
    undefined;

  const document = await documents.create(ctx, {
    languageId: input.languageId,
    courseId,
    classSessionId: input.classSessionId,
    title: input.title,
    origin: "NATIVE",
    status: "READY",
  });

  await leaves.createNotePage(ctx, {
    documentId: document.id,
    position: "1",
    content: templateContent(input.template),
  });

  return document;
}

async function lastLeafId(
  ctx: Ctx,
  documentId: string,
): Promise<string | null> {
  const all = await leaves.listForDocument(ctx, documentId, true);
  return all[all.length - 1]?.id ?? null;
}

/** Rewrites every position to 1, 2, 3 … in order. Rare; see position.ts. */
async function renumberDocument(ctx: Ctx, documentId: string): Promise<void> {
  const all = await leaves.listForDocument(ctx, documentId, true);
  const positions = renumber(all.length);

  for (const [index, leaf] of all.entries()) {
    await leaves.move(ctx, leaf.id, positions[index]!);
  }
}

export { TEMPLATES, TEMPLATE_KEYS, isTemplateKey } from "./templates";
export type { TemplateKey } from "./templates";
