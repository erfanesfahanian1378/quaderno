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
 * Download this document for offline, from the viewer's own header.
 *
 * The same action exists in the right rail's Info tab, and that is where it
 * was — three taps deep, behind a panel most people never open. For the one
 * feature whose entire purpose is "make sure I have this before I lose signal",
 * being hard to find is the same as being absent.
 *
 * So it sits next to Export, on the document it applies to, and reports its
 * three states plainly: not kept, downloading, kept.
 */
export function OfflineButton({
  documentId,
  className,
}: {
  documentId: string;
  className?: string;
}) {
  const [kept, setKept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
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

  /*
   * Nothing at all when the browser cannot do it.
   *
   * On a plain-http LAN address `serviceWorker` is not merely blocked, it is
   * absent — a button here would be a promise the platform cannot keep. The
   * Info tab explains why; the header is not the place for a paragraph.
   */
  if (support !== "ready") return null;

  const download = () => {
    if (kept) {
      void dropOffline(documentId).then(() => setKept(false));
      return;
    }

    setBusy(true);
    setFailed(false);

    // The signed url is fetched now and its BODY stored, so the five-minute
    // expiry never matters again.
    void api
      .get<{ url: string }>(`/api/documents/${documentId}/source-url`)
      .then((result) => {
        if (result.ok) return keepOffline(documentId, result.data.url);
        setBusy(false);
        setFailed(true);
      });
  };

  const label = failed
    ? "Could not download"
    : busy
      ? "Downloading…"
      : kept
        ? "Saved on this device"
        : "Save for offline";

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      title={label}
      aria-label={label}
      aria-pressed={kept}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-label transition-colors duration-[120ms]",
        kept
          ? "text-success-on-soft"
          : failed
            ? "text-danger"
            : "text-ink-2 hover:bg-subtle hover:text-ink",
        busy && "opacity-70",
        className,
      )}
    >
      {busy ? <Spinner /> : kept ? <DownloadedIcon /> : <DownloadIcon />}
      {/* The word is hidden on a phone, where the toolbar is tight. The icon
          and its aria-label carry the meaning there. */}
      <span className="hidden sm:inline">{busy ? "Saving…" : "Offline"}</span>
    </button>
  );
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  );
}

/**
 * "Downloaded" — a tick INSIDE a circle, not a bare one.
 *
 * The sync indicator sits immediately to the left and already shows a plain
 * "✓ Saved". Two bare ticks side by side, meaning two different things —
 * "your marks reached the server" and "this document is on your phone" — read
 * as one repeated icon. The ring is what separates them at a glance.
 */
function DownloadedIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 animate-spin motion-reduce:animate-none"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
