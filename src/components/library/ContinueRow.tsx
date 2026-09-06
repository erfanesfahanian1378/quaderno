import Link from "next/link";
import type { DocumentCard } from "@/server/repositories/document";
import type { AccentKey } from "@/lib/tokens";
import { DocumentThumb } from "./DocumentThumb";

/**
 * A horizontally scrolling row of the last six documents (DESIGN_BRIEF §5.3).
 * Scrolls inside its own container so the page body never scrolls sideways.
 */
export function ContinueRow({
  documents,
  languages,
}: {
  documents: DocumentCard[];
  languages: { id: string; name: string; accentKey: string }[];
}) {
  return (
    <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      {documents.map((document) => {
        const language = languages.find((l) => l.id === document.languageId);

        return (
          <li key={document.id} className="w-[180px] shrink-0">
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
                  {language?.name ?? "—"} · {relativeDay(document.lastOpenedAt)}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function relativeDay(date: Date | null): string {
  if (!date) return "not opened yet";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "opened today";
  if (days === 1) return "opened yesterday";
  if (days < 7) return `opened ${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "opened last week" : `opened ${weeks} weeks ago`;
}
