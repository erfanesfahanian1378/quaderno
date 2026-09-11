"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, handler } from "@/lib/api-client";
import { cn } from "@/lib/cn";

/**
 * Put a document back, from the trash view.
 *
 * This is the other half of a delete that was always reversible in the
 * database and never in the interface. It replaces the tile's menu rather
 * than joining it: nothing else — rename, move, star — is a sensible thing to
 * do to something you have thrown away.
 */
export function RestoreButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restore = handler(
    async () => {
      setBusy(true);
      setError(null);

      const result = await api.post(`/api/documents/${documentId}/restore`, {});
      setBusy(false);

      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    },
    () => setBusy(false),
  );

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={busy}
        onClick={restore}
        className={cn(
          "shrink-0 rounded-sm px-2 py-1 text-caption transition-colors duration-[120ms]",
          "text-accent hover:bg-accent-soft disabled:opacity-50",
        )}
      >
        {busy ? "Restoring…" : "Restore"}
      </button>
      {error ? <span className="text-caption text-danger">{error}</span> : null}
    </div>
  );
}
