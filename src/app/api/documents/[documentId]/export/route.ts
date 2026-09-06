import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as documents from "@/server/repositories/document";
import * as annotations from "@/server/repositories/annotation";
import { getSignedReadUrl } from "@/server/storage";
import { searchParams } from "@/server/api/request";

type Params = { documentId: string };

/** Past this, the browser export is no longer the right tool. */
const CLIENT_EXPORT_LIMIT = 150;

/**
 * Everything the browser needs to bake the export itself.
 *
 * The server hands over data and one signed URL and does no rendering, which
 * is worth roughly 2 GB-seconds of CPU per export on a box that has none
 * (ARCHITECTURE.md §2).
 */
export const GET = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();

  const full = await documents.findFull(ctx, params.documentId);
  if (!full) throw notFound("Document");

  const flavour = searchParams(request).get("flavour") ?? "flattened";

  if (full.leaves.length > CLIENT_EXPORT_LIMIT) {
    // PHASE-09 queues a server-side job here, reusing the same layout code.
    return NextResponse.json({
      mode: "server" as const,
      message:
        "This document is long enough that we will build the export on the server and tell you when it is ready.",
      leafCount: full.leaves.length,
    });
  }

  const all = await annotations.listForDocument(ctx, params.documentId);
  const byLeaf = new Map<string, typeof all>();
  for (const annotation of all) {
    const list = byLeaf.get(annotation.leafId) ?? [];
    list.push(annotation);
    byLeaf.set(annotation.leafId, list);
  }

  const primary = full.sourceFiles.find((file) => file.pdfStorageKey);
  const sourceUrl = primary?.pdfStorageKey
    ? (await getSignedReadUrl(ctx.userId, primary.pdfStorageKey)).url
    : null;

  return NextResponse.json({
    mode: "client" as const,
    flavour,
    title: full.title,
    sourceUrl,
    leafCount: full.leaves.length,
    leaves: full.leaves.map((leaf) => ({
      id: leaf.id,
      kind: leaf.kind,
      sourcePageIndex: leaf.sourcePageIndex,
      label: leaf.label,
      noteContent: leaf.notePage?.content ?? null,
      annotations: (byLeaf.get(leaf.id) ?? []).map((annotation) => ({
        kind: annotation.kind,
        // The TOKEN KEY, not a hex. The client resolves it against the theme
        // it is actually in — resolving here would bake the wrong colour into
        // a dark-mode export.
        colorHex: annotation.color,
        opacity: annotation.opacity,
        geometry: annotation.geometry as Record<string, unknown>,
        quotedText: annotation.quotedText,
      })),
    })),
  });
});
