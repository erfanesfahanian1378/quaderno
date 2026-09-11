"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";

export type MoveTarget = { id: string | null; label: string; depth: number };

/**
 * Rename, move and delete, on the document tile.
 *
 * Renaming is inline rather than a dialog: the title is right there, and a
 * modal to change one word is more ceremony than the act deserves. The input
 * replaces the title in place, which also makes it obvious what is being
 * renamed when four tiles are on screen.
 */
export function DocumentMenu({
  documentId,
  title,
  folderId,
  targets,
}: {
  documentId: string;
  title: string;
  folderId: string | null;
  /** Every folder in this language, flattened, with an indent depth. */
  targets: MoveTarget[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    const result = await api.patch(`/api/documents/${documentId}`, body);
    setBusy(false);

    if (!result.ok) {
      setError(result.error.message);
      return false;
    }
    router.refresh();
    return true;
  };

  /*
   * Delete is a SOFT delete, and the confirm says so rather than warning.
   *
   * The server has always kept the row for thirty days — the point was that
   * nothing could reach it, so the delete was permanent to the person doing
   * it. Undo lives in the Trash view rather than in a toast here: this menu
   * unmounts the moment the tile it belongs to is refreshed away, which is
   * exactly when an undo would be wanted.
   */
  const remove = async () => {
    setBusy(true);
    setError(null);

    const result = await api.delete(`/api/documents/${documentId}`);
    setBusy(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setOpen(false);
    setConfirming(false);
    router.refresh();
  };

  const rename = async () => {
    const trimmed = value.trim();
    // An empty title would leave a tile with nothing to click on.
    if (!trimmed || trimmed === title) {
      setRenaming(false);
      setValue(title);
      return;
    }
    if (await patch({ title: trimmed })) setRenaming(false);
  };

  if (renaming) {
    return (
      <div className="flex flex-col gap-1">
        <input
          autoFocus
          value={value}
          disabled={busy}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => void rename()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void rename();
            }
            if (event.key === "Escape") {
              setRenaming(false);
              setValue(title);
            }
          }}
          maxLength={200}
          aria-label="Document title"
          className="w-full rounded-sm border border-accent bg-surface px-1.5 py-0.5 text-label text-ink outline-none"
        />
        {error ? <p className="text-caption text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Options for ${title}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(event) => {
          // The tile is a link; opening its menu must not follow it.
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="grid size-7 place-items-center rounded-sm text-ink-3 hover:bg-subtle hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <circle cx="19" cy="12" r="1.6" fill="currentColor" />
        </svg>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={(event) => {
              event.preventDefault();
              setOpen(false);
            }}
          />

          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-1 max-h-[320px] w-[240px] overflow-y-auto rounded-md border border-hairline bg-surface p-1 shadow-e2"
          >
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.preventDefault();
                setOpen(false);
                setRenaming(true);
              }}
              className="w-full rounded-sm px-3 py-2 text-left text-label text-ink hover:bg-subtle"
            >
              Rename
            </button>

            <div className="my-1 h-px bg-hairline" />
            <p className="px-3 py-1 text-caption text-ink-3">Move to</p>

            {targets.map((target) => (
              <button
                key={target.id ?? "root"}
                type="button"
                role="menuitem"
                disabled={busy || target.id === folderId}
                onClick={(event) => {
                  event.preventDefault();
                  setOpen(false);
                  void patch({ folderId: target.id });
                }}
                className={cn(
                  "flex w-full items-center rounded-sm px-3 py-1.5 text-left text-body-sm hover:bg-subtle disabled:opacity-40",
                  target.id === folderId ? "text-ink-3" : "text-ink-2",
                )}
                style={{ paddingLeft: 12 + target.depth * 12 }}
              >
                <span className="truncate">{target.label}</span>
                {target.id === folderId ? (
                  <span className="ml-auto text-caption">here</span>
                ) : null}
              </button>
            ))}

            <div className="my-1 h-px bg-hairline" />

            {confirming ? (
              <div className="px-3 py-2">
                <p className="text-caption text-ink-2">
                  Goes to the trash, where you can put it back for 30 days.
                </p>
                <div className="mt-1.5 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={(event) => {
                      event.preventDefault();
                      void remove();
                    }}
                    className="rounded-sm bg-danger px-2 py-1 text-caption text-on-danger disabled:opacity-50"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      setConfirming(false);
                    }}
                    className="rounded-sm px-2 py-1 text-caption text-ink-2 hover:bg-subtle"
                  >
                    Keep
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={(event) => {
                  event.preventDefault();
                  setConfirming(true);
                }}
                className="w-full rounded-sm px-3 py-2 text-left text-label text-danger hover:bg-danger-soft disabled:opacity-40"
              >
                Delete
              </button>
            )}

            {error ? (
              <p className="px-3 py-2 text-caption text-danger">{error}</p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
