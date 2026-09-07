"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, handler } from "@/lib/api-client";
import { Banner, Button } from "@/components/ui";
import {
  TEMPLATES,
  TEMPLATE_KEYS,
} from "@/server/services/composition/templates";
import { cn } from "@/lib/cn";

/**
 * A blank notebook: a document made of your own pages, with no handout under
 * it.
 *
 * It is the same document, the same viewer and the same annotation layer as
 * an uploaded PDF — the only difference is that every leaf is a note page. So
 * everything already built works on it: highlighting, ink, export, offline,
 * sharing, and the vocabulary tables that become review cards.
 *
 * It opens straight into the new notebook rather than returning to the
 * library. Making a notebook is something you do because you want to write in
 * it now.
 */
export function NewNotebook({
  languageId,
  folderId,
}: {
  languageId: string;
  /** The folder currently being viewed, so it lands where you are. */
  folderId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [template, setTemplate] =
    useState<(typeof TEMPLATE_KEYS)[number]>("blank");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = handler(
    async () => {
      setBusy(true);
      setError(null);

      const result = await api.post<{ id: string }>("/api/documents", {
        languageId,
        title: title.trim() || "Untitled notebook",
        template,
      });

      if (!result.ok) {
        setBusy(false);
        setError(result.error.message);
        return;
      }

      /*
       * Filing happens after creation rather than as part of it: the create
       * endpoint predates folders, and adding a folder to it would mean the
       * upload path had to learn about them too. A failed move leaves the
       * notebook at the top level, which is recoverable and visible.
       */
      if (folderId) {
        await api.patch(`/api/documents/${result.data.id}`, { folderId });
      }

      router.push(`/d/${result.data.id}`);
    },
    () => setBusy(false),
  );

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <PenIcon />
        New notebook
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 rounded-md border border-hairline bg-surface p-4">
      <div>
        <p className="text-label text-ink">New notebook</p>
        <p className="mt-0.5 text-caption text-ink-3">
          Your own pages, with nothing underneath. Everything works on it the
          same way — marks, export, sharing, and vocabulary tables that become
          review cards.
        </p>
      </div>

      {error ? <Banner tone="danger">{error}</Banner> : null}

      <input
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") create(event);
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder="Untitled notebook"
        maxLength={200}
        className="h-11 rounded-sm border border-hairline-strong bg-surface px-3 text-body text-ink"
      />

      <div className="flex flex-wrap gap-1.5">
        {TEMPLATE_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTemplate(key)}
            aria-pressed={template === key}
            title={TEMPLATES[key].description}
            className={cn(
              "h-8 rounded-full border px-3 text-caption transition-colors duration-[120ms]",
              template === key
                ? "border-transparent bg-accent/15 text-accent"
                : "border-hairline text-ink-2 hover:bg-subtle hover:text-ink",
            )}
          >
            {TEMPLATES[key].name}
          </button>
        ))}
      </div>

      <p className="text-caption text-ink-3">
        {TEMPLATES[template].description}
      </p>

      <div className="flex gap-2">
        <Button loading={busy} onClick={create}>
          Create and open
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function PenIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
