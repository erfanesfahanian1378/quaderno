import Link from "next/link";
import { requireUserPage } from "@/server/auth/guards";
import * as languages from "@/server/repositories/language";
import * as documents from "@/server/repositories/document";
import { EmptyState } from "@/components/ui";
import { Dropzone } from "@/components/library/Dropzone";
import { DocumentThumb } from "@/components/library/DocumentThumb";
import { LibraryFilters } from "@/components/library/LibraryFilters";
import { FolderBar } from "@/components/library/FolderBar";
import { NewNotebook } from "@/components/library/NewNotebook";
import {
  DocumentMenu,
  type MoveTarget,
} from "@/components/library/DocumentMenu";
import {
  pathTo,
  tree,
  type FolderNode,
} from "@/server/services/library/folders";
import type { AccentKey } from "@/lib/tokens";

export const metadata = { title: "Library" };
export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{
    languageId?: string;
    classSessionId?: string;
    folderId?: string;
    q?: string;
    starred?: string;
  }>;
}) {
  const ctx = await requireUserPage("/library");
  const params = await searchParams;

  const list = await languages.list(ctx);
  const activeLanguageId = params.languageId ?? list[0]?.id;

  if (!activeLanguageId) {
    return (
      <EmptyState
        title="Add a language first"
        description="Documents live inside a language, so there is somewhere to put your handouts."
        action={
          <Link
            href="/onboarding"
            className="rounded-md bg-accent px-4 py-2 text-label text-accent-on"
          >
            Add a language
          </Link>
        }
      />
    );
  }

  const { roots, byId } = await tree(ctx, activeLanguageId);
  const folderId = params.folderId ?? null;

  // A folder id that is not this language's is not an error worth a page of
  // its own — it just means the top level.
  const current = folderId ? (byId.get(folderId) ?? null) : null;
  const path = pathTo(byId, current?.id ?? null);
  const visibleFolders = current ? current.children : roots;

  const page = await documents.list(
    ctx,
    {
      languageId: params.languageId,
      classSessionId: params.classSessionId,
      query: params.q,
      starred: params.starred === "1" ? true : undefined,
      /*
       * Searching looks through the whole language, not just this folder.
       * Someone typing a word is looking for a document, not for a document
       * that happens to be filed where they are standing.
       */
      ...(params.q ? {} : { folderId: current?.id ?? null }),
    },
    { limit: 50 },
  );

  const moveTargets = flattenTargets(roots);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-reading text-display text-ink">Library</h1>
          <p className="mt-1 text-body-sm text-ink-2">
            Every handout, slide deck and note page, in one place.
          </p>
        </div>
      </header>

      <LibraryFilters languages={list} active={params} />

      <FolderBar
        languageId={activeLanguageId}
        path={path.map((node) => ({ id: node.id, name: node.name }))}
        folders={visibleFolders.map((node) => ({
          id: node.id,
          name: node.name,
          documentCount: node.documentCount,
        }))}
        childCounts={Object.fromEntries(
          visibleFolders.map((node) => [node.id, node.children.length]),
        )}
      />

      <div className="flex flex-wrap items-start gap-2">
        <NewNotebook
          languageId={activeLanguageId}
          folderId={current?.id ?? null}
        />
      </div>

      <Dropzone
        languageId={activeLanguageId}
        {...(params.classSessionId
          ? { classSessionId: params.classSessionId }
          : {})}
      />

      {page.items.length === 0 ? (
        <EmptyState
          title={params.q ? "Nothing matched that" : "No documents yet"}
          description={
            params.q
              ? "Try a shorter search, or a word from the title."
              : "Upload a handout above. Word files and photos become PDFs you can highlight, draw on and write between."
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {page.items.map((document) => {
            const language = list.find((l) => l.id === document.languageId);
            return (
              <li key={document.id}>
                <div
                  data-accent={(language?.accentKey ?? "accent-1") as AccentKey}
                  className="group flex flex-col gap-2"
                >
                  <Link href={`/d/${document.id}`}>
                    <DocumentThumb document={document} />
                  </Link>
                  <div className="flex items-start gap-1">
                    <Link href={`/d/${document.id}`} className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-label text-ink group-hover:underline">
                        {document.title}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-caption text-ink-3">
                        <span
                          aria-hidden="true"
                          className="size-2 shrink-0 rounded-full bg-accent"
                        />
                        {language?.name ?? "—"}
                        {document.leafCount > 0
                          ? ` · ${document.leafCount} page${document.leafCount === 1 ? "" : "s"}`
                          : ""}
                      </p>
                    </Link>

                    <DocumentMenu
                      documentId={document.id}
                      title={document.title}
                      folderId={document.folderId}
                      targets={moveTargets}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Every folder as a flat, indented list for the "Move to" menu.
 *
 * The top level is first and is a real destination — a document has to be
 * able to come back out of a folder, and without an explicit entry the only
 * way out would be to move it into some other folder.
 */
function flattenTargets(roots: FolderNode[]): MoveTarget[] {
  const out: MoveTarget[] = [{ id: null, label: "All documents", depth: 0 }];

  const walk = (nodes: FolderNode[], depth: number) => {
    for (const node of nodes) {
      out.push({ id: node.id, label: node.name, depth: depth + 1 });
      walk(node.children, depth + 1);
    }
  };

  walk(roots, 0);
  return out;
}
