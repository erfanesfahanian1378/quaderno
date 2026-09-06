import { cn } from "@/lib/cn";
import type { DocumentCard } from "@/server/repositories/document";
import { FileIcon, NoteIcon } from "@/components/nav/icons";

/**
 * Page-1 thumbnail, 4:3 and **top-aligned** so the header of a handout stays
 * visible (DESIGN_BRIEF §5.6) — a centre crop hides exactly the part that
 * tells you which handout it is.
 */
export function DocumentThumb({
  document,
  className,
}: {
  document: DocumentCard;
  className?: string;
}) {
  const converting =
    document.status === "PENDING" || document.status === "CONVERTING";
  const failed = document.status === "FAILED";

  return (
    <div
      className={cn(
        "relative aspect-[4/3] w-full overflow-hidden rounded-sm border border-hairline bg-surface",
        className,
      )}
    >
      {document.thumbnailKey ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/documents/${document.id}/thumbnail`}
          alt=""
          className="size-full object-cover object-top"
          loading="lazy"
        />
      ) : (
        <div className="grid size-full place-items-center bg-subtle text-ink-3">
          {document.origin === "NATIVE" ? (
            <NoteIcon className="size-7" />
          ) : (
            <FileIcon className="size-7" />
          )}
        </div>
      )}

      {converting ? (
        <div className="absolute inset-0 grid place-items-center bg-surface/85 px-2 text-center">
          <div>
            <div className="mx-auto mb-2 h-1 w-16 overflow-hidden rounded-full bg-inset">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />
            </div>
            <p className="text-caption text-ink-2">converting…</p>
          </div>
        </div>
      ) : null}

      {failed ? (
        <div className="absolute inset-x-0 bottom-0 bg-danger-soft px-2 py-1 text-caption text-danger-on-soft">
          conversion failed
        </div>
      ) : null}
    </div>
  );
}
