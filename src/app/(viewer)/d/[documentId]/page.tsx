import { notFound } from "next/navigation";
import { requireUserPage } from "@/server/auth/guards";
import * as documents from "@/server/repositories/document";
import * as languages from "@/server/repositories/language";
import { Viewer, type ViewerLeaf } from "@/components/viewer/Viewer";
import { Banner, Button } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const ctx = await requireUserPage();
  const { documentId } = await params;
  const document = await documents.findById(ctx, documentId);
  return { title: document?.title ?? "Document" };
}

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const ctx = await requireUserPage(`/d/${documentId}`);

  const full = await documents.findFull(ctx, documentId);
  // A document owned by someone else is indistinguishable from one that does
  // not exist. CLAUDE.md rule 3.
  if (!full) notFound();

  const language = await languages.findById(ctx, full.languageId);
  const primary = full.sourceFiles.find((file) => file.pdfStorageKey);

  if (full.status !== "READY") {
    return <NotReady status={full.status} title={full.title} id={full.id} />;
  }

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
    <Viewer
      document={{
        id: full.id,
        title: full.title,
        status: full.status,
        languageAccent: language?.accentKey ?? "accent-1",
        languageCode: language?.code ?? "en",
        hasTextLayer: primary?.hasTextLayer ?? true,
        conversionEngine: primary?.conversionEngine ?? null,
        originalName: primary?.originalName ?? null,
      }}
      leaves={leaves}
    />
  );
}

/**
 * Converting and failed both land here. The failed state must always offer the
 * original download — the original is never mutated, so that promise is always
 * keepable (CLAUDE.md rule 8).
 */
function NotReady({
  status,
  title,
  id,
}: {
  status: string;
  title: string;
  id: string;
}) {
  const failed = status === "FAILED";
  const neverArrived = status === "PENDING";

  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center gap-5 px-6">
      <h1 className="font-reading text-h1 text-ink">{title}</h1>

      {failed ? (
        <>
          <Banner tone="danger">
            We could not convert that file. Your original is untouched and still
            downloadable.
          </Banner>
          <div className="flex gap-3">
            <a href={`/api/documents/${id}/original-url`}>
              <Button variant="secondary">Download the original</Button>
            </a>
            <Link href="/library">
              <Button variant="ghost">Back to the library</Button>
            </Link>
          </div>
        </>
      ) : neverArrived ? (
        <>
          {/*
            PENDING means the bytes never arrived, not that we are busy. Saying
            "still converting" here is a lie the user cannot act on — they wait
            for something that is never going to happen.
          */}
          <Banner tone="warning">
            This file never finished uploading, so there is nothing to open yet.
            Try uploading it again from the library.
          </Banner>
          <div className="flex gap-3">
            <Link href="/library">
              <Button variant="secondary">Back to the library</Button>
            </Link>
          </div>
        </>
      ) : (
        <>
          <Banner tone="info">
            Still converting this document. It will open as soon as it is ready
            — you can leave this page.
          </Banner>
          <div className="flex flex-col gap-3">
            <div className="h-1 overflow-hidden rounded-full bg-inset">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />
            </div>
            <Link href="/library">
              <Button variant="ghost">Back to the library</Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
