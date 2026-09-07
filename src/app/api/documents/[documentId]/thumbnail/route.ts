import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as documents from "@/server/repositories/document";
import { getObjectBytes } from "@/server/storage";

type Params = { documentId: string };

/**
 * The page-1 thumbnail image.
 *
 * Streamed through the app rather than handed out as a signed URL. A library
 * page shows twenty tiles, and signing twenty URLs — each a SigV4 computation
 * and each expiring in five minutes — costs more than proxying a 30 KB PNG.
 * It also keeps the object store out of the page's connection list entirely,
 * which matters on a phone where every extra origin is another handshake.
 *
 * A document belonging to someone else is not found, never forbidden.
 */
export const GET = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();

  const document = await documents.findById(ctx, params.documentId);
  if (!document?.thumbnailKey) throw notFound("Thumbnail");

  const bytes = await getObjectBytes(document.thumbnailKey).catch(() => null);
  // The row can point at an object that never landed. That is a 404, not a
  // 500: there is nothing wrong with the server, the picture just is not there.
  if (!bytes) throw notFound("Thumbnail");

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      /*
       * A thumbnail is immutable for the life of its key — re-ingesting a
       * document writes a new leaf id and so a new key. `private` because it
       * is one user's document and must never be held by a shared cache.
       */
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});
