"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, handler } from "@/lib/api-client";

/**
 * What to say when a conversion has clearly stopped.
 *
 * CONVERTING is an honest state and the spinner was an honest spinner — but
 * it animated for ever, so a document whose worker had died looked exactly
 * like one that was busy. There was nothing to read and nothing to press.
 *
 * The threshold is generous on purpose. A 218-page PDF is repaired in under a
 * second, and the slowest path — LibreOffice on a large deck — is bounded by
 * WORKER_CONVERT_TIMEOUT_MS at two minutes. Three minutes is past anything
 * that is still working, which matters because calling a busy document stuck
 * teaches people to ignore the message.
 */
const STUCK_AFTER_MS = 3 * 60 * 1000;

export function StuckNotice({
  documentId,
  status,
  updatedAt,
}: {
  documentId: string;
  status: string;
  /** ISO. When the document last changed state. */
  updatedAt: string;
}) {
  const router = useRouter();
  const [stuck, setStuck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "CONVERTING") return;

    const since = Date.now() - new Date(updatedAt).getTime();
    if (since >= STUCK_AFTER_MS) {
      setStuck(true);
      return;
    }

    // Checked on a timer rather than once, so a document that goes stale
    // while someone is looking at the page says so without a reload.
    const timer = setTimeout(() => setStuck(true), STUCK_AFTER_MS - since);
    return () => clearTimeout(timer);
  }, [status, updatedAt]);

  if (status !== "CONVERTING" || !stuck) return null;

  const retry = handler(
    async () => {
      setBusy(true);
      setMessage(null);

      const result = await api.post(`/api/documents/${documentId}/retry`, {});
      setBusy(false);

      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }

      setStuck(false);
      setMessage("Queued again.");
      router.refresh();
    },
    () => setBusy(false),
  );

  return (
    <div className="mt-1 rounded-sm bg-warning-soft px-2 py-1.5 text-caption text-warning-on-soft">
      <p>Taking longer than usual.</p>
      {message ? (
        <p className="mt-0.5">{message}</p>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={retry}
          className="mt-0.5 underline underline-offset-2 disabled:opacity-50"
        >
          {busy ? "Trying again…" : "Try again"}
        </button>
      )}
    </div>
  );
}
