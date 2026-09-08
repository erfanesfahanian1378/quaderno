"use client";

import { useEffect, useState } from "react";

/**
 * When the page you are looking at was stored, if it came from the cache.
 *
 * A page served from cache is stale by definition, and the one thing it must
 * never do is pretend otherwise — a schedule from this morning shown as if it
 * were live is worse than no schedule.
 *
 * The page reads its own cache entry rather than being told by the service
 * worker. There is nothing to message: the entry is right there, stamped with
 * the time it was written, and asking the worker would mean a round trip and a
 * protocol for an answer the page can look up itself.
 *
 * Returns null while checking, and null when the page came from the network —
 * both mean "say nothing", which is what a fresh page should say.
 */
export function useCachedAt(): Date | null {
  const [cachedAt, setCachedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      if (typeof caches === "undefined" || typeof navigator === "undefined") {
        return;
      }

      /*
       * Only when offline. The entry exists whether or not it was used, so
       * checking it while online would label a freshly fetched page as stale
       * — the cache is written on every successful navigation.
       */
      if (navigator.onLine) return;

      try {
        const match = await caches.match(window.location.href);
        const header = match?.headers.get("x-quaderno-cached-at");
        if (!cancelled && header) {
          const parsed = Date.parse(header);
          if (!Number.isNaN(parsed)) setCachedAt(new Date(parsed));
        }
      } catch {
        // Storage blocked. Nothing to report, which is the right answer.
      }
    };

    void read();

    // Re-check when the connection changes: a page loaded online and then
    // taken offline is still the live one, and must not suddenly claim to be
    // stale.
    const onOnline = () => setCachedAt(null);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", () => void read());

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return cachedAt;
}
