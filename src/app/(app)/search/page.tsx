import Link from "next/link";
import { requireUserPage } from "@/server/auth/guards";
import * as languages from "@/server/repositories/language";
import * as search from "@/server/repositories/search";
import { Card, EmptyState } from "@/components/ui";
import { SearchField } from "@/components/search/SearchField";
import type { AccentKey, HighlightKey } from "@/lib/tokens";

export const metadata = { title: "Search" };
export const dynamic = "force-dynamic";

const GROUPS = [
  { type: "document", label: "Documents" },
  { type: "note", label: "Note pages" },
  { type: "annotation", label: "Highlights" },
  { type: "comment", label: "Comments" },
  { type: "class", label: "Classes" },
] as const;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await requireUserPage("/search");
  const { q } = await searchParams;

  const [list, hits] = await Promise.all([
    languages.list(ctx),
    q ? search.search(ctx, q) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-reading text-display text-ink">Search</h1>
        <p className="mt-1 text-body-sm text-ink-2">
          Accents do not matter — <em>perche</em> also finds <em>perché</em>.
        </p>
      </header>

      <SearchField initial={q ?? ""} />

      {!q ? null : hits.length === 0 ? (
        <EmptyState
          title={`Nothing matched “${q}”`}
          description="Try a shorter word, or part of one. Search covers document titles, your note pages, highlighted text, comments and class titles."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {GROUPS.map((group) => {
            const groupHits = hits.filter((hit) => hit.type === group.type);
            if (groupHits.length === 0) return null;

            return (
              <section key={group.type} className="flex flex-col gap-2">
                <h2 className="text-h3 text-ink">{group.label}</h2>

                <Card className="divide-y divide-hairline">
                  {groupHits.map((hit) => {
                    const language = list.find(
                      (entry) => entry.id === hit.languageId,
                    );

                    const body = (
                      <div
                        data-accent={
                          (language?.accentKey ?? "accent-1") as AccentKey
                        }
                        className="px-4 py-3"
                      >
                        {/* Breadcrumb, per DESIGN_BRIEF §5.12. */}
                        <p className="flex items-center gap-1.5 text-caption text-ink-3">
                          <span
                            aria-hidden="true"
                            className="size-2 rounded-full bg-accent"
                          />
                          {language?.name ?? "—"} › {hit.title}
                        </p>

                        {hit.snippet ? (
                          <p className="mt-1 text-body-sm text-ink">
                            {hit.type === "annotation" ? (
                              // A highlight result shows its quoted text in
                              // its own highlighter colour.
                              <mark
                                className="text-ink"
                                style={{
                                  background: `var(--${(hit.color ?? "hl-yellow") as HighlightKey})`,
                                  boxShadow: `0 0 0 2px var(--${(hit.color ?? "hl-yellow") as HighlightKey})`,
                                }}
                              >
                                {hit.snippet}
                              </mark>
                            ) : (
                              hit.snippet
                            )}
                          </p>
                        ) : null}
                      </div>
                    );

                    return hit.documentId ? (
                      <Link
                        key={`${hit.type}-${hit.id}`}
                        href={`/d/${hit.documentId}`}
                        className="block hover:bg-subtle"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div key={`${hit.type}-${hit.id}`}>{body}</div>
                    );
                  })}
                </Card>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
