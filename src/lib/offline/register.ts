"use client";

/**
 * Service worker registration and the small API the app uses to talk to it.
 *
 * **A service worker needs a SECURE CONTEXT.** It registers on `https://` and
 * on `localhost`, and not on a plain-HTTP LAN address — the same rule that
 * makes `crypto.randomUUID` undefined on a phone at `http://192.168.x.x`. So
 * this reports honestly rather than failing silently, and the UI says
 * "offline reading needs HTTPS" instead of pretending a document is kept.
 */

export type OfflineSupport = "ready" | "insecure-context" | "unsupported";

export function offlineSupport(): OfflineSupport {
  if (typeof navigator === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator)) return "unsupported";
  if (!window.isSecureContext) return "insecure-context";
  return "ready";
}

/**
 * NOT in development, and any worker already there is removed.
 *
 * A service worker serves stale content on purpose. In development that means
 * serving code you have already changed — and Next makes it worse than usual,
 * because dev chunks are named by ROUTE (`app/(app)/settings/page.js`,
 * `webpack.js`) with contents that change on every edit, while a production
 * build content-hashes every filename. `/_next/static` is immutable in exactly
 * one of those two cases, and the worker believed both.
 *
 * The result is webpack resolving a module id that no longer exists —
 * "Cannot read properties of undefined (reading 'call')" — blamed on whatever
 * component is in the stack, and immune to every edit made to fix it, because
 * the edits never reach the browser.
 *
 * Nothing is lost by switching it off here: the offline suite has always run
 * against a production build, since `next dev` serves chunks from urls with
 * changing `?v=` query strings and nothing cache-first ever hits.
 *
 * The dev server also rewrites /sw.js to a worker that unregisters itself, so
 * a browser too far gone to run this function still recovers. Both, because
 * this one cannot run when the bug it fixes is what is broken.
 */
export async function registerServiceWorker(): Promise<boolean> {
  if (offlineSupport() !== "ready") return false;

  if (process.env.NODE_ENV === "development") {
    await unregisterServiceWorker();
    return false;
  }

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return true;
  } catch {
    return false;
  }
}

/** Remove every worker and every cache this app has put on the device. */
export async function unregisterServiceWorker(): Promise<void> {
  try {
    for (const registration of await navigator.serviceWorker.getRegistrations()) {
      await registration.unregister();
    }

    for (const key of await caches.keys()) {
      if (key.startsWith("quaderno-")) await caches.delete(key);
    }
  } catch {
    // Nothing here is worth breaking a page load over.
  }
}

/** Asks the worker to fetch and keep a document's bytes. */
export async function keepOffline(
  documentId: string,
  signedUrl: string,
): Promise<void> {
  const registration = await navigator.serviceWorker?.ready;
  registration?.active?.postMessage({
    type: "cache-document",
    documentId,
    url: signedUrl,
  });
}

export async function dropOffline(documentId: string): Promise<void> {
  const registration = await navigator.serviceWorker?.ready;
  registration?.active?.postMessage({ type: "drop-document", documentId });
}

/** Which documents are actually held, so the UI never guesses. */
export async function cachedDocumentIds(): Promise<Set<string>> {
  if (typeof caches === "undefined") return new Set();

  try {
    const names = await caches.keys();
    const docsName = names.find((name) => name.startsWith("quaderno-docs-"));
    if (!docsName) return new Set();

    const cache = await caches.open(docsName);
    const requests = await cache.keys();

    return new Set(
      requests
        .map((request) => {
          const match = /\/__cached-document__\/(.+)$/.exec(
            new URL(request.url).pathname,
          );
          return match?.[1] ?? null;
        })
        .filter((id): id is string => id !== null),
    );
  } catch {
    return new Set();
  }
}
