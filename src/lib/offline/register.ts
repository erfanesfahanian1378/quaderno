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

export async function registerServiceWorker(): Promise<boolean> {
  if (offlineSupport() !== "ready") return false;

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return true;
  } catch {
    return false;
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
