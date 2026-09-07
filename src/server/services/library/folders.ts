import type { Ctx } from "@/server/repositories/base";
import * as folders from "@/server/repositories/folder";
import { conflict, notFound } from "@/server/errors";

/**
 * The rules a folder tree needs that the database cannot express.
 *
 * Two of them, and both are the kind that produce a library nobody can use
 * rather than an error anyone notices:
 *
 *   - A folder must not be moved inside itself or inside one of its own
 *     descendants. The rows stay valid; the subtree simply detaches from the
 *     root and every document in it becomes unreachable.
 *   - Nesting has to stop somewhere. Postgres will happily store a hundred
 *     levels and no breadcrumb can show them.
 */

/** Deep enough for "Term 1 / Grammar / Verbs"; shallow enough to render. */
export const MAX_DEPTH = 6;

export type FolderNode = folders.FolderRow & {
  children: FolderNode[];
  documentCount: number;
};

/** The tree for one language, plus per-folder document counts. */
export async function tree(
  ctx: Ctx,
  languageId: string,
): Promise<{ roots: FolderNode[]; byId: Map<string, FolderNode> }> {
  const [rows, counts] = await Promise.all([
    folders.listForLanguage(ctx, languageId),
    folders.documentCounts(ctx, languageId),
  ]);

  const byId = new Map<string, FolderNode>(
    rows.map((row) => [
      row.id,
      { ...row, children: [], documentCount: counts[row.id] ?? 0 },
    ]),
  );

  const roots: FolderNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    // A parent that is missing means the row was orphaned — the SET NULL
    // fallback firing. Treat it as top level rather than dropping it, so the
    // folder is still reachable.
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return { roots, byId };
}

/** Root → this folder, for the breadcrumb. */
export function pathTo(
  byId: Map<string, FolderNode>,
  folderId: string | null,
): FolderNode[] {
  const path: FolderNode[] = [];
  let current = folderId ? byId.get(folderId) : undefined;

  // Bounded by MAX_DEPTH rather than by reaching the root, so a cycle that
  // somehow got stored cannot hang the page that renders it.
  for (let i = 0; current && i <= MAX_DEPTH + 1; i += 1) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return path;
}

function depthOf(
  byId: Map<string, FolderNode>,
  folderId: string | null,
): number {
  return pathTo(byId, folderId).length;
}

/** Every descendant of a folder, itself included. */
function subtreeIds(
  node: FolderNode,
  into: Set<string> = new Set(),
): Set<string> {
  into.add(node.id);
  for (const child of node.children) subtreeIds(child, into);
  return into;
}

export async function createFolder(
  ctx: Ctx,
  input: { languageId: string; parentId: string | null; name: string },
): Promise<folders.FolderRow> {
  if (input.parentId) {
    const parent = await folders.findById(ctx, input.parentId);
    // A parent in another language, or someone else's, is not found.
    if (!parent || parent.languageId !== input.languageId) {
      throw notFound("Folder");
    }

    const { byId } = await tree(ctx, input.languageId);
    if (depthOf(byId, input.parentId) >= MAX_DEPTH) {
      throw conflict(
        `Folders can be ${MAX_DEPTH} levels deep. Put this one higher up.`,
      );
    }
  }

  return folders.create(ctx, input);
}

export async function renameFolder(
  ctx: Ctx,
  id: string,
  name: string,
): Promise<folders.FolderRow> {
  const updated = await folders.update(ctx, id, { name });
  if (!updated) throw notFound("Folder");
  return updated;
}

export async function moveFolder(
  ctx: Ctx,
  id: string,
  parentId: string | null,
): Promise<folders.FolderRow> {
  const folder = await folders.findById(ctx, id);
  if (!folder) throw notFound("Folder");

  if (parentId === id) {
    throw conflict("A folder cannot go inside itself.");
  }

  const { byId } = await tree(ctx, folder.languageId);

  if (parentId) {
    const parent = byId.get(parentId);
    if (!parent) throw notFound("Folder");

    // The one that matters: moving a folder into its own descendant detaches
    // the whole subtree from the root, and every document in it disappears
    // from the library without anything reporting an error.
    const node = byId.get(id);
    if (node && subtreeIds(node).has(parentId)) {
      throw conflict("A folder cannot go inside one of its own folders.");
    }

    const movingDepth = node ? depthOfSubtree(node) : 1;
    if (depthOf(byId, parentId) + movingDepth > MAX_DEPTH) {
      throw conflict(
        `That would nest folders more than ${MAX_DEPTH} levels deep.`,
      );
    }
  }

  const updated = await folders.update(ctx, id, { parentId });
  if (!updated) throw notFound("Folder");
  return updated;
}

/** How many levels the subtree rooted here occupies. */
function depthOfSubtree(node: FolderNode): number {
  if (node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(depthOfSubtree));
}

export async function deleteFolder(
  ctx: Ctx,
  id: string,
): Promise<{ movedFolders: number; movedDocuments: number }> {
  const result = await folders.removeKeepingContents(ctx, id);
  if (!result) throw notFound("Folder");
  return result;
}
