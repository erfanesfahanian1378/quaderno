import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { conflict, notFound } from "@/server/errors";
import * as notePages from "@/server/repositories/note-page";

type Params = { notePageId: string };

const putSchema = z.object({
  content: z.string().max(200_000),
  pageSize: z.enum(["A4", "LETTER"]).optional(),
  orientation: z.enum(["portrait", "landscape"]).optional(),
});

export const GET = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();
  const page = await notePages.findById(ctx, params.notePageId);
  if (!page) throw notFound("Note page");
  return NextResponse.json(page);
});

/**
 * Autosave target, 800ms debounced on the client.
 *
 * `If-Unmodified-Since` turns "the same note open in two tabs" from silent
 * data loss into a 409 the UI can surface. Losing a page of notes because the
 * other tab won a race is exactly the thing this app must never do.
 */
export const PUT = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const input = putSchema.parse(await request.json());

  const ifUnmodifiedSince = request.headers.get("If-Unmodified-Since");
  const existing = await notePages.findById(ctx, params.notePageId);
  if (!existing) throw notFound("Note page");

  if (ifUnmodifiedSince) {
    const since = new Date(ifUnmodifiedSince);
    // Second precision: the header carries no milliseconds.
    if (
      Math.floor(existing.updatedAt.getTime() / 1000) >
      Math.floor(since.getTime() / 1000)
    ) {
      throw conflict(
        "This page changed somewhere else. Reload to see the newer version, or overwrite it.",
        { updatedAt: existing.updatedAt.toISOString() },
      );
    }
  }

  const updated = await notePages.update(ctx, params.notePageId, input);
  if (!updated) throw notFound("Note page");

  return NextResponse.json(updated, {
    headers: { "Last-Modified": updated.updatedAt.toUTCString() },
  });
});
