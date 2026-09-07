import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { conflict, notFound } from "@/server/errors";
import * as notePages from "@/server/repositories/note-page";
import * as users from "@/server/repositories/user";
import { syncNotePage } from "@/server/services/review/sync";
import { parseCards } from "@/server/services/review/parse";
import { dayKeyInZone } from "@/lib/time";
import { logger } from "@/server/logger";

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

  await syncCards(ctx, params.notePageId, existing.content, updated.content);

  return NextResponse.json(updated, {
    headers: { "Last-Modified": updated.updatedAt.toUTCString() },
  });
});

/**
 * Keep the page's review cards in step with its vocabulary tables.
 *
 * This is what makes "fill in the table, get a deck" true without a button.
 * Two things it must not do: cost anything on the common save, and fail the
 * save.
 *
 * The fast path is the first check, and it is worth being precise about what
 * it skips. It skips pages with NO vocabulary rows on either side of the
 * edit — which is almost every save, because almost every note page is prose.
 * It deliberately does NOT skip a page whose rows are unchanged: reconciling
 * that page costs one indexed SELECT and finds nothing to write, and making
 * the sync self-healing is worth that. A version keyed on the content diff
 * alone leaves a page permanently out of step with its cards if a single sync
 * ever fails, with no way back except editing the table again.
 *
 * Failures are caught, not propagated. A scheduling problem is not a reason
 * to lose a page of notes.
 */
async function syncCards(
  ctx: { userId: string },
  notePageId: string,
  before: string,
  after: string,
): Promise<void> {
  try {
    if (!hasCards(before) && !hasCards(after)) return;

    const context = await notePages.contextOf(ctx, notePageId);
    const user = await users.findById(ctx);
    const timeZone = user?.timeZone ?? "Europe/Rome";

    await syncNotePage(ctx, {
      notePageId,
      content: after,
      languageId: context?.languageId ?? null,
      todayKey: dayKeyInZone(new Date(), timeZone),
    });
  } catch (error) {
    logger.error({ err: error, notePageId }, "review card sync failed");
  }
}

function hasCards(markdown: string): boolean {
  // Cheap enough to run on every save: a scan of the text with no I/O.
  return parseCards(markdown).length > 0;
}
