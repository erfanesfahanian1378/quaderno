import { NextResponse } from "next/server";
import { prisma } from "@/server/repositories/client";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound, conflict } from "@/server/errors";
import { enqueueIngest } from "@/server/jobs/enqueue";

type Params = { documentId: string };

/**
 * Put a stuck document back in the queue.
 *
 * A document sits in CONVERTING between the bytes landing and the worker
 * finishing with them. If the worker is not running — restarted, crashed,
 * never started in development — nothing moves it, and the library showed a
 * pulsing "converting…" bar for ever with no way to act on it. That is the
 * gap this closes: the state was honest, the dead end was not.
 *
 * Re-sending is safe because page creation is idempotent — see
 * `createSourcePages`. It was NOT when this route was written: replaying a
 * completed ingest violated the unique key on (documentId, position) and left
 * the document FAILED. That was already reachable without this route, since
 * pg-boss retries ingest three times.
 */
export const POST = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();

  const document = await prisma.document.findFirst({
    where: { id: params.documentId, userId: ctx.userId, deletedAt: null },
    select: {
      id: true,
      status: true,
      sourceFiles: {
        select: { id: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!document) throw notFound("Document");

  /*
   * No source file means the upload itself never finished, which retrying
   * cannot fix — there is nothing to convert. Saying so beats re-queueing a
   * job that will find nothing and leave the document exactly as it was.
   */
  const sourceFile = document.sourceFiles[0];
  if (!sourceFile) {
    throw conflict(
      "The file never finished uploading, so there is nothing to convert. Upload it again.",
    );
  }

  await prisma.document.update({
    where: { id: document.id },
    data: { status: "CONVERTING" as never },
  });

  await enqueueIngest({
    sourceFileId: sourceFile.id,
    documentId: document.id,
    userId: ctx.userId,
  });

  return NextResponse.json({ status: "CONVERTING" });
});
