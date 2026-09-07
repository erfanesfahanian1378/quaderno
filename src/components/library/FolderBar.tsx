"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, handler } from "@/lib/api-client";
import { Banner, Button } from "@/components/ui";
import { cn } from "@/lib/cn";

export type FolderCrumb = { id: string; name: string };
export type FolderTile = { id: string; name: string; documentCount: number };

/**
 * Folders: where you are, what is here, and the two things you can make.
 *
 * The breadcrumb doubles as the way back out — a folder view with no route to
 * its parent is a trap, and on a phone the browser's back button is the only
 * other way, which breaks the moment someone arrives from a link.
 */
export function FolderBar({
  languageId,
  path,
  folders,
  childCounts,
}: {
  languageId: string;
  /** Root → current. Empty at the language's top level. */
  path: FolderCrumb[];
  /** Folders directly inside the current one. */
  folders: FolderTile[];
  /** Sub-folder counts, so a folder of folders does not look empty. */
  childCounts: Record<string, number>;
}) {
  const router = useRouter();
  const current = path[path.length - 1] ?? null;

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  const renameCurrent = handler(
    async () => {
      if (!current) return;
      const trimmed = newName.trim();
      if (!trimmed || trimmed === current.name) {
        setRenaming(false);
        return;
      }

      setBusy(true);
      setError(null);
      const result = await api.patch(`/api/folders/${current.id}`, {
        name: trimmed,
      });
      setBusy(false);

      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setRenaming(false);
      router.refresh();
    },
    () => setBusy(false),
  );

  const removeCurrent = handler(
    async () => {
      if (!current) return;

      setBusy(true);
      setError(null);
      const result = await api.delete<{
        movedFolders: number;
        movedDocuments: number;
      }>(`/api/folders/${current.id}`);
      setBusy(false);

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      // Back to where the folder was, which is where its contents now are.
      router.push(href(path[path.length - 2]?.id ?? null));
      router.refresh();
    },
    () => setBusy(false),
  );

  const create = handler(
    async () => {
      const trimmed = name.trim();
      if (!trimmed) return;

      setBusy(true);
      setError(null);

      const result = await api.post<{ id: string }>("/api/folders", {
        languageId,
        parentId: current?.id ?? null,
        name: trimmed,
      });

      setBusy(false);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      setName("");
      setCreating(false);
      router.refresh();
    },
    () => setBusy(false),
  );

  const href = (folderId: string | null) =>
    `/library?languageId=${languageId}${folderId ? `&folderId=${folderId}` : ""}`;

  return (
    <div className="flex flex-col gap-3">
      <nav
        aria-label="Folders"
        className="flex flex-wrap items-center gap-1 text-body-sm"
      >
        <Link
          href={href(null)}
          className={cn(
            "rounded-sm px-1.5 py-0.5",
            path.length === 0
              ? "text-ink"
              : "text-ink-2 underline underline-offset-2 hover:text-ink",
          )}
        >
          All documents
        </Link>

        {path.map((crumb, index) => (
          <span key={crumb.id} className="flex items-center gap-1">
            <span aria-hidden="true" className="text-ink-3">
              /
            </span>
            <Link
              href={href(crumb.id)}
              aria-current={index === path.length - 1 ? "page" : undefined}
              className={cn(
                "rounded-sm px-1.5 py-0.5",
                index === path.length - 1
                  ? "text-ink"
                  : "text-ink-2 underline underline-offset-2 hover:text-ink",
              )}
            >
              {crumb.name}
            </Link>
          </span>
        ))}
      </nav>

      {error ? <Banner tone="danger">{error}</Banner> : null}

      {/*
        Rename and delete act on the folder you are standing in, not on a tile.
        A menu on every tile would put "delete" one mis-tap from a term's work;
        having to open a folder first is a small, deliberate step.
      */}
      {current ? (
        renaming ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") renameCurrent(event);
                if (event.key === "Escape") setRenaming(false);
              }}
              maxLength={80}
              aria-label="Folder name"
              className="h-9 min-w-0 flex-1 rounded-sm border border-accent bg-surface px-3 text-body text-ink outline-none sm:max-w-[260px]"
            />
            <Button size="sm" loading={busy} onClick={renameCurrent}>
              Rename
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRenaming(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setNewName(current.name);
                setRenaming(true);
              }}
            >
              Rename folder
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={removeCurrent}
            >
              Delete folder
            </Button>
            <span className="text-caption text-ink-3">
              Deleting the folder keeps everything in it — documents and
              sub-folders move up one level.
            </span>
          </div>
        )
      ) : null}

      {folders.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {folders.map((folder) => (
            <li key={folder.id}>
              <Link
                href={href(folder.id)}
                className="flex items-center gap-2 rounded-md border border-hairline bg-surface px-3 py-2.5 transition-colors duration-[120ms] hover:bg-subtle"
              >
                <FolderIcon />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label text-ink">
                    {folder.name}
                  </span>
                  <span className="block text-caption text-ink-3">
                    {describe(
                      folder.documentCount,
                      childCounts[folder.id] ?? 0,
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {creating ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") create(event);
              if (event.key === "Escape") {
                setCreating(false);
                setName("");
              }
            }}
            placeholder="Folder name"
            maxLength={80}
            className="h-9 min-w-0 flex-1 rounded-sm border border-hairline-strong bg-surface px-3 text-body text-ink sm:max-w-[260px]"
          />
          <Button size="sm" loading={busy} onClick={create}>
            Create
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setCreating(false);
              setName("");
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setCreating(true)}
          >
            <FolderIcon />
            New folder
            {current ? ` in ${current.name}` : ""}
          </Button>
        </div>
      )}
    </div>
  );
}

function describe(documents: number, folders: number): string {
  const parts: string[] = [];
  if (folders > 0) parts.push(`${folders} folder${folders === 1 ? "" : "s"}`);
  if (documents > 0)
    parts.push(`${documents} document${documents === 1 ? "" : "s"}`);
  return parts.join(" · ") || "empty";
}

function FolderIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 shrink-0 text-ink-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.5.7l1 1.3H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}
