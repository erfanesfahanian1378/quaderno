import { notFound } from "next/navigation";
import { headers } from "next/headers";
import * as shareLinks from "@/server/repositories/share-link";
import * as documents from "@/server/repositories/document";
import * as annotations from "@/server/repositories/annotation";
import * as languages from "@/server/repositories/language";
import * as rateLimit from "@/server/repositories/rate-limit";
import { getSignedReadUrl } from "@/server/storage";
import { SharedViewer } from "@/components/viewer/SharedViewer";
import type { ViewerLeaf } from "@/components/viewer/Viewer";
import type { Annotation } from "@/components/viewer/annotations/store";

export const dynamic = "force-dynamic";

/**
 * A shared document, read-only, for a signed-out visitor.
 *
 * This is the only unauthenticated surface in the app besides /api/health, so
 * three rules apply and none of them are optional:
 *
 *   1. The token resolves to the OWNER's userId, and every read below is made
 *      with the ordinary tenant-scoped repositories using it. A share token
 *      grants exactly one document; it is not an identity.
 *   2. Anything wrong — unknown token, revoked, expired, deleted document —
 *      is a 404. Never a 403, which would confirm the token once existed.
 *   3. Rate limited by IP, because there is no session to limit by and a
 *      token is guessable in principle.
 */
export async function generateMetadata() {
  // Deliberately generic: the title of a shared document should not leak into
  // a link preview in a group chat the owner did not choose.
  return { title: "Shared document", robots: { index: false, follow: false } };
}

export default async function SharedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerList.get("x-real-ip") ??
    "unknown";

  const limit = await rateLimit.consume("share-view", ip, 60, 300);
  if (!limit.allowed) notFound();

  const link = await shareLinks.resolveToken(token);
  if (!link) notFound();

  // From here on this is an ordinary owner-scoped read. Note the ctx: it is
  // the OWNER's, reconstructed from the token, not a visitor identity.
  const ctx = { userId: link.userId };

  const full = await documents.findFull(ctx, link.documentId);
  if (!full || full.status !== "READY") notFound();

  const [language, marks] = await Promise.all([
    languages.findById(ctx, full.languageId),
    annotations.listForDocument(ctx, full.id),
  ]);

  const primary = full.sourceFiles.find((file) => file.pdfStorageKey);
  const source = primary?.pdfStorageKey
    ? await getSignedReadUrl(ctx.userId, primary.pdfStorageKey)
    : null;

  await shareLinks.recordView(link.shareLinkId);

  const leaves: ViewerLeaf[] = full.leaves.map((leaf) => ({
    id: leaf.id,
    kind: leaf.kind,
    sourcePageIndex: leaf.sourcePageIndex,
    label: leaf.label,
    rotation: leaf.rotation,
    notePage: leaf.notePage
      ? { id: leaf.notePage.id, content: leaf.notePage.content }
      : null,
  }));

  return (
    <SharedViewer
      title={full.title}
      leaves={leaves}
      annotations={marks.map((mark) => ({
        clientId: mark.clientId,
        leafId: mark.leafId,
        // The database column is a string; the union is the client's view of
        // the same enum, and the repository only ever writes members of it.
        kind: mark.kind as Annotation["kind"],
        color: mark.color as Annotation["color"],
        opacity: mark.opacity,
        zIndex: mark.zIndex,
        geometry: mark.geometry as Record<string, unknown>,
        quotedText: mark.quotedText,
      }))}
      sourceUrl={source?.url ?? null}
      accentKey={language?.accentKey ?? "accent-1"}
    />
  );
}
