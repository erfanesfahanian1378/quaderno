"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import {
  cachedDocumentIds,
  dropOffline,
  keepOffline,
  offlineSupport,
} from "@/lib/offline/register";
import { cn } from "@/lib/cn";

/**
 * "Keep this offline."
 *
 * Explicit rather than automatic: someone leaving for a lesson needs to
 * *guarantee* what they will have, and an LRU cache is a guess. It reports
 * plainly when the browser cannot do it at all rather than showing a control
 * that silently does nothing.
 */
export function OfflineToggle({
  documentId,
  className,
}: {
  documentId: string;
  className?: string;
}) {
  const [kept, setKept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [support, setSupport] =
    useState<ReturnType<typeof offlineSupport>>("unsupported");

  useEffect(() => {
    setSupport(offlineSupport());
    void cachedDocumentIds().then((ids) => setKept(ids.has(documentId)));

    const onMessage = (event: MessageEvent) => {
      if (
        event.data?.type === "document-cached" &&
        event.data.documentId === documentId
      ) {
        setKept(true);
        setBusy(false);
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [documentId]);

  if (support === "insecure-context") {
    return (
      <p className={cn("text-caption text-ink-3", className)}>
        Keeping documents offline needs HTTPS. On a plain http:// address the
        browser will not allow it.
      </p>
    );
  }

  if (support === "unsupported") return null;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (kept) {
          void dropOffline(documentId).then(() => setKept(false));
          return;
        }

        setBusy(true);
        // The signed URL is fetched now and its BODY stored, so the five
        // minute expiry never matters again.
        void api
          .get<{ url: string }>(`/api/documents/${documentId}/source-url`)
          .then((result) => {
            if (result.ok) return keepOffline(documentId, result.data.url);
            setBusy(false);
          });
      }}
      className={cn(
        "flex items-center gap-1.5 rounded-sm px-2 py-1 text-caption transition-colors duration-[120ms]",
        kept
          ? "bg-success-soft text-success-on-soft"
          : "text-ink-2 hover:bg-subtle",
        className,
      )}
    >
      <span aria-hidden="true">{kept ? "✓" : "↓"}</span>
      {busy ? "Saving…" : kept ? "Kept offline" : "Keep offline"}
    </button>
  );
}
