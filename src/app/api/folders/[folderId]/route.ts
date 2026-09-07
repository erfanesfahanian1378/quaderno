import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import {
  deleteFolder,
  moveFolder,
  renameFolder,
} from "@/server/services/library/folders";

type Params = { folderId: string };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  /** `null` moves the folder to the language's top level. */
  parentId: z.string().min(1).nullable().optional(),
});

export const PATCH = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const input = patchSchema.parse(await request.json());

  let folder = null;
  if (input.name !== undefined) {
    folder = await renameFolder(ctx, params.folderId, input.name);
  }
  if (input.parentId !== undefined) {
    // After the rename, so a single request can do both and the move's
    // cycle check runs against the current tree either way.
    folder = await moveFolder(ctx, params.folderId, input.parentId);
  }

  return NextResponse.json(folder);
});

/** Deletes the folder. Never its contents — they move up to its parent. */
export const DELETE = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();
  return NextResponse.json(await deleteFolder(ctx, params.folderId));
});
