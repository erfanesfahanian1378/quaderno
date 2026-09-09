"use client";

import { api } from "@/lib/api-client";
import { keepOffline, offlineSupport } from "./register";

/**
 * Fill the cache before it is needed, rather than after.
 *
 * The old rule was that a page became available offline once you had visited
 * it online. Which sounds reasonable and fails the actual case: someone opens
 * the app on a train, taps Review for the first time this week, and is told
 * the page needs a connection — for a page the server would have sent
 * perfectly well an hour ago, over wifi, for free.
 *
 * So a signed-in client asks the server what it should be holding and hands
 * that list to the worker. It costs a few hundred kilobytes on a connection
 * that already exists, once an hour at most, and it is the difference between
 * an app that works offline and one that merely does not crash.
 */

export type WarmProgress = {
  done: number;
  total: number;
  label: string;
};

type Manifest = {
  pages: string[];
  api: string[];
  documents: { id: string; title: string }[];
};

/** Remembered so a warm does not run on every navigation. */
const MARK = "quaderno:warmed-at";

/**
 * An hour.
 *
 * Short enough that a document added this morning is available this afternoon;
 * long enough that moving between five pages does not refetch the whole app
 * five times.
 */
const EVERY_MS = 60 * 60 * 1000;

function due(): boolean {
  try {
    const last = Number(window.localStorage.getItem(MARK) ?? 0);
    return Date.now() - last > EVERY_MS;
  } catch {
    // Storage refused — a private window, or a browser set to block it. Warm
    // anyway; a repeated warm is wasteful, a skipped one is broken.
    return true;
  }
}

function mark(): void {
  try {
    window.localStorage.setItem(MARK, String(Date.now()));
  } catch {
    // See above.
  }
}

/**
 * Ask the worker to cache every route this reader can reach.
 *
 * Returns the manifest so a caller that wants the documents too — the "keep
 * everything" control in settings — does not have to fetch it twice.
 */
export async function warmRoutes(force = false): Promise<Manifest | null> {
  if (offlineSupport() !== "ready") return null;
  if (!navigator.onLine) return null;
  if (!force && !due()) return null;

  const result = await api.get<Manifest>("/api/offline/manifest");
  if (!result.ok) return null;

  const registration = await navigator.serviceWorker.ready;
  if (!registration.active) return null;

  registration.active.postMessage({
    type: "warm",
    pages: result.data.pages,
    api: result.data.api,
  });

  mark();
  return result.data;
}

/**
 * Every route AND every document's bytes.
 *
 * Separate from `warmRoutes` because the cost is different by two orders of
 * magnitude: routes are kilobytes and happen automatically, documents are
 * hundreds of megabytes and happen when someone asks. Never make this one
 * automatic — it is somebody's mobile data.
 */
export async function keepEverything(
  onProgress?: (done: number, total: number, title: string) => void,
): Promise<{ kept: number; failed: number }> {
  const manifest = await warmRoutes(true);
  if (!manifest) return { kept: 0, failed: 0 };

  let kept = 0;
  let failed = 0;

  for (const [index, document] of manifest.documents.entries()) {
    onProgress?.(index, manifest.documents.length, document.title);

    // The signed url is fetched here and its BODY stored by the worker, so
    // the five-minute expiry never matters again.
    const url = await api.get<{ url: string }>(
      `/api/documents/${document.id}/source-url`,
    );

    if (!url.ok) {
      failed += 1;
      continue;
    }

    await keepOffline(document.id, url.data.url);
    kept += 1;
  }

  onProgress?.(manifest.documents.length, manifest.documents.length, "");
  return { kept, failed };
}

/**
 * Forget this device's copy of everything.
 *
 * Called on sign-out. Cached pages are rendered HTML holding one person's
 * library and notes; leaving them for whoever signs in next is not an
 * acceptable default, however unlikely it is on a personal phone.
 */
export async function forgetEverything(): Promise<void> {
  if (offlineSupport() !== "ready") return;

  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({ type: "sign-out" });

  try {
    window.localStorage.removeItem(MARK);
  } catch {
    // Nothing to do; the worker has already been told.
  }
}

/** Subscribe to warm progress. Returns an unsubscribe. */
export function onWarmProgress(
  listener: (progress: WarmProgress | null) => void,
): () => void {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) {
    return () => {};
  }

  const handle = (event: MessageEvent) => {
    if (event.data?.type === "warm-progress") {
      listener({
        done: event.data.done,
        total: event.data.total,
        label: event.data.label,
      });
    }
    // `null` means finished, which is how a caller knows to stop showing
    // anything at all rather than parking at 100%.
    if (event.data?.type === "warm-done") listener(null);
  };

  navigator.serviceWorker.addEventListener("message", handle);
  return () => navigator.serviceWorker.removeEventListener("message", handle);
}
