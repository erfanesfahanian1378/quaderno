import Link from "next/link";
import { requireUserPage } from "@/server/auth/guards";
import * as languages from "@/server/repositories/language";
import * as documents from "@/server/repositories/document";
import { EmptyState } from "@/components/ui";
import { Dropzone } from "@/components/library/Dropzone";
import { DocumentThumb } from "@/components/library/DocumentThumb";
import { LibraryFilters } from "@/components/library/LibraryFilters";
import type { AccentKey } from "@/lib/tokens";

export const metadata = { title: "Library" };
export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{
    languageId?: string;
    classSessionId?: string;
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

  const page = await documents.list(
    ctx,
    {
      languageId: params.languageId,
      classSessionId: params.classSessionId,
      query: params.q,
      starred: params.starred === "1" ? true : undefined,
    },
    { limit: 50 },
  );

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
                <Link
                  href={`/d/${document.id}`}
                  data-accent={(language?.accentKey ?? "accent-1") as AccentKey}
                  className="group flex flex-col gap-2"
                >
                  <DocumentThumb document={document} />
                  <div>
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
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
