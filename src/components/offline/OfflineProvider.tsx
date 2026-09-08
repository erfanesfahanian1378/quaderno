"use client";

import { useEffect, useState } from "react";
import { useOnline } from "@/lib/offline/useOnline";
import { useCachedAt } from "@/lib/offline/cachedAt";
import { offlineSupport, registerServiceWorker } from "@/lib/offline/register";
import { cn } from "@/lib/cn";

/**
 * Registers the service worker and shows the offline strip.
 *
 * The strip is honest about what offline means here: annotations keep working
 * because they queue locally, and a document you have not kept will not open.
 * ARCHITECTURE.md §5 says never to pretend a queued write landed; the same
 * applies to reading.
 */
export function OfflineProvider() {
  const online = useOnline();
  const cachedAt = useCachedAt();
  const [support, setSupport] =
    useState<ReturnType<typeof offlineSupport>>("unsupported");

  useEffect(() => {
    setSupport(offlineSupport());
    void registerServiceWorker();
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className={cn(
        "fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 px-3 py-1.5",
        "bg-warning-soft text-caption text-warning-on-soft",
      )}
    >
      <span aria-hidden="true">⌁</span>

      {/*
        When the page came from cache, SAY WHEN. A schedule from this morning
        shown as though it were live is worse than no schedule at all — the
        reader acts on it.
      */}
      {cachedAt ? (
        <span>
          Offline — showing this page as it was at{" "}
          {cachedAt.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}
          . Your changes are saved here and sync when you reconnect.
        </span>
      ) : support === "ready" ? (
        "Offline — your changes are saved here and will sync when you reconnect."
      ) : (
        "Offline — your changes are saved here. Documents you have not opened yet will not load."
      )}
    </div>
  );
}
