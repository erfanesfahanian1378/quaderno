"use client";

import { useEffect, useState } from "react";
import { useOnline } from "@/lib/offline/useOnline";
import { useCachedAt } from "@/lib/offline/cachedAt";
import { offlineSupport, registerServiceWorker } from "@/lib/offline/register";
import {
  onWarmProgress,
  warmRoutes,
  type WarmProgress,
} from "@/lib/offline/warm";
import { cn } from "@/lib/cn";

/**
 * Registers the service worker, warms the cache, and shows the offline strip.
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
  const [warming, setWarming] = useState<WarmProgress | null>(null);

  useEffect(() => {
    setSupport(offlineSupport());

    let stop = () => {};

    void registerServiceWorker().then((registered) => {
      if (!registered) return;
      stop = onWarmProgress(setWarming);

      /*
       * Warm AFTER the first paint, not during it.
       *
       * A warm is thirty-odd requests. Firing them while the page it was
       * called from is still fetching its own data makes that page slower for
       * a benefit that is entirely about some later page — precisely the
       * trade nobody would choose. `requestIdleCallback` where it exists, a
       * timeout where it does not, which is Safari.
       */
      const start = () => void warmRoutes();

      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(start, { timeout: 8000 });
      } else {
        window.setTimeout(start, 3000);
      }
    });

    return () => stop();
  }, []);

  if (!online) {
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

  /*
   * A hairline at the top of the window while warming, and nothing else.
   *
   * Downloading pages nobody asked for is not an event that deserves a dialog,
   * a toast, or a percentage. It is background work on someone else's
   * schedule; the only reason to show anything at all is so a slow connection
   * does not look like a hung tab.
   */
  if (warming && warming.total > 0) {
    return (
      <div
        role="status"
        aria-label="Preparing offline access"
        className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-transparent"
      >
        <div
          className="h-full bg-accent/60 transition-[width] duration-300 ease-out"
          style={{ width: `${(warming.done / warming.total) * 100}%` }}
        />
      </div>
    );
  }

  return null;
}
