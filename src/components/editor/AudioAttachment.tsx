"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { Banner } from "@/components/ui";
import { useSpeech } from "@/lib/speech";
import { cn } from "@/lib/cn";

type Asset = {
  id: string;
  mimeType: string;
  durationMs: number | null;
  label: string | null;
  url: string;
};

/**
 * Record yourself, then hear the reference voice and compare.
 *
 * The comparison is the feature. A recording on its own is a voice memo; a
 * recording next to a synthesised native pronunciation of the same word is a
 * pronunciation drill, which is what a language learner actually wants.
 *
 * `getUserMedia` requires a SECURE CONTEXT — https or localhost. It does not
 * work on `http://192.168.x.x`, which is exactly how this app gets opened on a
 * phone during development. Same rule as `crypto.randomUUID` and service
 * workers. That is a fact about the browser, not a bug to fix, so the UI says
 * so plainly instead of failing on a tap.
 */
export function AudioAttachment({
  notePageId,
  languageCode,
  practiceWord,
}: {
  notePageId: string;
  languageCode: string;
  /** Read aloud next to your own recording, for comparison. */
  practiceWord?: string;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [secure, setSecure] = useState(true);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const ticker = useRef<number | null>(null);

  const speech = useSpeech(languageCode);

  useEffect(() => {
    // `isSecureContext` is the browser's own answer to the question, which is
    // better than guessing from the protocol — it is true on localhost too.
    setSecure(
      typeof window !== "undefined" &&
        window.isSecureContext &&
        typeof navigator.mediaDevices?.getUserMedia === "function",
    );
  }, []);

  const load = useCallback(async () => {
    const result = await api.get<{ assets: Asset[] }>(
      `/api/note-pages/${notePageId}/assets`,
    );
    if (result.ok) setAssets(result.data.assets);
  }, [notePageId]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = useCallback(
    async (blob: Blob, durationMs: number) => {
      const created = await api.post<{
        asset: { id: string };
        upload: { url: string; headers: Record<string, string> };
      }>(`/api/note-pages/${notePageId}/assets`, {
        mimeType: blob.type.split(";")[0] || "audio/webm",
        byteSize: blob.size,
        durationMs,
      });

      if (!created.ok) {
        setError(created.error.message);
        return;
      }

      const put = await fetch(created.data.upload.url, {
        method: "PUT",
        // Content-Length is signed in and set by the browser from the body;
        // sending it explicitly is a forbidden header and is dropped.
        headers: {
          "Content-Type": created.data.upload.headers["Content-Type"]!,
        },
        body: blob,
      }).catch(() => null);

      if (!put?.ok) {
        setError("The recording did not upload. Try again.");
        return;
      }

      await load();
    },
    [load, notePageId],
  );

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      /*
       * Let the browser choose the codec. Chrome and Firefox give webm/opus,
       * Safari gives mp4/aac, and naming a mimeType Safari does not support
       * throws rather than falling back — so the server accepts both instead.
       */
      const media = new MediaRecorder(stream);
      chunks.current = [];

      media.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };

      media.onstop = () => {
        const duration = Date.now() - startedAt.current;
        const blob = new Blob(chunks.current, { type: media.mimeType });
        // Release the microphone. Without this the browser keeps showing the
        // recording indicator, which reads as the app still listening.
        for (const track of stream.getTracks()) track.stop();
        if (blob.size > 0) void upload(blob, duration);
      };

      startedAt.current = Date.now();
      media.start();
      recorder.current = media;
      setRecording(true);
      setElapsed(0);

      ticker.current = window.setInterval(
        () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)),
        250,
      );
    } catch {
      setError(
        "We could not reach the microphone. Check the permission for this site.",
      );
    }
  };

  const stop = useCallback(() => {
    recorder.current?.stop();
    recorder.current = null;
    setRecording(false);
    if (ticker.current) window.clearInterval(ticker.current);
    ticker.current = null;
  }, []);

  // Stop on unmount, or the microphone stays open after navigation.
  useEffect(() => stop, [stop]);

  const remove = async (id: string) => {
    const result = await api.delete(`/api/note-assets/${id}`);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setAssets((current) => current.filter((asset) => asset.id !== id));
  };

  if (!secure) {
    return (
      <Banner tone="info">
        Recording needs a secure connection, so it does not work over a plain
        <code className="px-1">http://</code> address on your network. Open the
        app over https or on this device to record.
      </Banner>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => (recording ? stop() : void start())}
          className={cn(
            "flex h-9 items-center gap-2 rounded-full px-3 text-label transition-colors duration-[120ms]",
            recording
              ? "bg-danger text-white"
              : "border border-hairline text-ink-2 hover:bg-subtle hover:text-ink",
          )}
        >
          <span
            className={cn(
              "size-2.5 rounded-full bg-current",
              recording && "animate-pulse motion-reduce:animate-none",
            )}
            aria-hidden="true"
          />
          {recording ? `Stop · ${elapsed}s` : "Record"}
        </button>

        {practiceWord && speech.supported ? (
          <button
            type="button"
            onClick={() => speech.speak(practiceWord)}
            className="h-9 rounded-full border border-hairline px-3 text-label text-ink-2 hover:bg-subtle hover:text-ink"
          >
            Hear it said
          </button>
        ) : null}
      </div>

      {assets.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {assets.map((asset) => (
            <li key={asset.id} className="flex items-center gap-2">
              <audio
                controls
                preload="none"
                src={asset.url}
                className="h-9 flex-1"
              />

              <button
                type="button"
                onClick={() => void remove(asset.id)}
                aria-label="Delete recording"
                className="text-caption text-ink-3 underline underline-offset-2 hover:text-danger"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
