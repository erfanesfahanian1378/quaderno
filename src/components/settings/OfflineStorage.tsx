"use client";

import { useCallback, useEffect, useState } from "react";
import { handler } from "@/lib/api-client";
import { Banner, Button, Card } from "@/components/ui";
import { cachedDocumentIds, offlineSupport } from "@/lib/offline/register";
import { forgetEverything, keepEverything } from "@/lib/offline/warm";
import { formatBytes } from "@/lib/compress-pdf";

/**
 * What this device is holding, and the one button that fills it.
 *
 * Every other offline control in the app is per-document and appears where
 * that document is. This is the one place for "before I get on the plane,
 * take everything" — a deliberate, expensive action that must never happen on
 * its own, because it is somebody's mobile data and possibly a gigabyte of it.
 */
export function OfflineStorage() {
  const [support, setSupport] =
    useState<ReturnType<typeof offlineSupport>>("unsupported");
  const [kept, setKept] = useState<number | null>(null);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    title: string;
  } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setKept((await cachedDocumentIds()).size);

    /*
     * The browser's own number, not ours.
     *
     * Adding up Content-Length across the caches gives a figure that is always
     * wrong — it misses compression, headers and the index — and the estimate
     * is what the browser will actually enforce a quota against.
     */
    try {
      const estimate = await navigator.storage?.estimate();
      if (estimate?.usage != null && estimate.quota != null) {
        setUsage({ used: estimate.usage, quota: estimate.quota });
      }
    } catch {
      // Not available on this browser. The document count still tells the
      // useful half of the story.
    }
  }, []);

  useEffect(() => {
    setSupport(offlineSupport());
    void refresh();
  }, [refresh]);

  if (support === "unsupported") {
    return (
      <Card className="p-4">
        <p className="text-body-sm text-ink-2">
          This browser cannot keep pages offline.
        </p>
      </Card>
    );
  }

  /*
   * The HTTPS explanation, in full, because it is the single most confusing
   * thing about this app on a phone.
   *
   * On a plain-http LAN address the service worker API is not blocked, it is
   * ABSENT — the same rule that makes crypto.randomUUID undefined there. So
   * nothing is broken and nothing will work, which is impossible to guess at.
   */
  if (support === "insecure-context") {
    return (
      <Card className="p-4">
        <Banner tone="warning">
          Offline access needs a secure connection. This page is on plain
          <code className="mx-1 rounded-xs bg-inset px-1">http://</code>, where
          browsers switch the feature off entirely. It works on the deployed
          site, and locally over <code>https://</code>.
        </Banner>
      </Card>
    );
  }

  const keep = handler(
    async () => {
      setBusy(true);
      setDone(null);

      const result = await keepEverything((doneCount, total, title) =>
        setProgress({ done: doneCount, total, title }),
      );

      setProgress(null);
      setBusy(false);
      await refresh();

      setDone(
        result.failed > 0
          ? `${result.kept} kept, ${result.failed} could not be downloaded.`
          : `${result.kept} document${result.kept === 1 ? "" : "s"} kept on this device.`,
      );
    },
    () => setBusy(false),
  );

  const forget = handler(
    async () => {
      setBusy(true);
      await forgetEverything();
      setBusy(false);
      await refresh();
      setDone("Cleared. Pages will be cached again as you use the app.");
    },
    () => setBusy(false),
  );

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <p className="text-body text-ink">
          {kept === null
            ? "Checking…"
            : kept === 0
              ? "No documents kept on this device yet."
              : `${kept} document${kept === 1 ? "" : "s"} kept on this device.`}
        </p>
        <p className="mt-0.5 text-body-sm text-ink-2">
          Pages are cached automatically as you use the app, so the whole app
          opens without a connection. Documents are large, so they are kept only
          when you ask.
        </p>
      </div>

      {usage ? (
        <div>
          <div className="flex items-baseline justify-between text-body-sm">
            <span className="text-ink-2">
              {formatBytes(usage.used)} on this device
            </span>
            <span className="text-ink-3">
              of about {formatBytes(usage.quota)} available
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-inset">
            <div
              className="h-full rounded-full bg-accent"
              style={{
                width: `${Math.min(100, (usage.used / usage.quota) * 100)}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {progress ? (
        <p className="text-body-sm text-ink-2" role="status">
          Downloading {progress.done + 1} of {progress.total}
          {progress.title ? ` — ${progress.title}` : ""}
        </p>
      ) : null}

      {done ? <Banner tone="success">{done}</Banner> : null}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={busy} onClick={keep}>
          Keep everything on this device
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={forget}>
          Clear offline data
        </Button>
      </div>
    </Card>
  );
}
