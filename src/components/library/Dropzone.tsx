"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { uuid } from "@/lib/uuid";
import { Banner, Button } from "@/components/ui";
import { UploadIcon } from "@/components/nav/icons";
import { cn } from "@/lib/cn";
import { useOnline } from "@/lib/offline/useOnline";
import {
  canCompress,
  compressPdf,
  formatBytes,
  type CompressResult,
} from "@/lib/compress-pdf";

/**
 * Upload dropzone.
 *
 * Implements the two-step flow from API.md: presign, PUT **straight to object
 * storage**, then complete. The bytes never touch the Node process, which is
 * what lets a 150 MB deck upload without the web container growing.
 */

type Upload = {
  id: string;
  name: string;
  progress: number;
  state: "uploading" | "converting" | "done" | "error";
  message?: string;
};

const ACCEPT = [
  "application/pdf",
  ".pdf",
  ".docx",
  ".doc",
  ".odt",
  ".pptx",
  ".ppt",
  ".odp",
  ".rtf",
  ".txt",
  ".md",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
].join(",");

/** The browser sometimes reports an empty type; fall back to the extension. */
function mimeFor(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    odt: "application/vnd.oasis.opendocument.text",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ppt: "application/vnd.ms-powerpoint",
    odp: "application/vnd.oasis.opendocument.presentation",
    rtf: "application/rtf",
    txt: "text/plain",
    md: "text/markdown",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    heic: "image/heic",
  };
  return map[extension] ?? "application/octet-stream";
}

export function Dropzone({
  languageId,
  classSessionId,
  maxBytes,
  className,
}: {
  languageId: string;
  classSessionId?: string;
  /** The server's limit, so a file can be refused before it is uploaded. */
  maxBytes: number;
  className?: string;
}) {
  const router = useRouter();
  const online = useOnline();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);

  /** Files the reader has been asked about but has not answered yet. */
  const [oversized, setOversized] = useState<
    { id: string; file: File; state: "asking" | "working"; note?: string }[]
  >([]);

  const patch = useCallback((id: string, next: Partial<Upload>) => {
    setUploads((current) =>
      current.map((upload) =>
        upload.id === id ? { ...upload, ...next } : upload,
      ),
    );
  }, []);

  const uploadOne = useCallback(
    async (file: File) => {
      const id = uuid();
      setUploads((current) => [
        ...current,
        { id, name: file.name, progress: 0, state: "uploading" },
      ]);

      const presigned = await api.post<{
        documentId: string;
        sourceFileId: string;
        uploadUrl: string;
        headers: Record<string, string>;
      }>("/api/uploads/presign", {
        fileName: file.name,
        mimeType: mimeFor(file),
        byteSize: file.size,
        languageId,
        ...(classSessionId ? { classSessionId } : {}),
      });

      if (!presigned.ok) {
        patch(id, { state: "error", message: presigned.error.message });
        return;
      }

      // XHR rather than fetch, purely for upload progress — fetch still has no
      // request-progress event, and a 50 MB upload with no feedback feels
      // broken.
      const uploaded = await new Promise<boolean>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", presigned.data.uploadUrl);
        for (const [key, value] of Object.entries(presigned.data.headers)) {
          // The browser sets Content-Length itself and forbids setting it.
          if (key.toLowerCase() === "content-length") continue;
          xhr.setRequestHeader(key, value);
        }
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            patch(id, {
              progress: Math.round((event.loaded / event.total) * 100),
            });
          }
        });
        xhr.addEventListener("load", () =>
          resolve(xhr.status >= 200 && xhr.status < 300),
        );
        xhr.addEventListener("error", () => resolve(false));
        xhr.send(file);
      });

      if (!uploaded) {
        patch(id, {
          state: "error",
          message:
            "The upload did not finish — the file never reached storage. Check your connection.",
        });

        // Clean up the row we created at presign time. Leaving it behind
        // means a card that says "waiting for the file" for ever, for a file
        // that is never coming.
        await api.delete(`/api/documents/${presigned.data.documentId}`);
        return;
      }

      patch(id, { progress: 100, state: "converting" });

      const completed = await api.post("/api/uploads/complete", {
        sourceFileId: presigned.data.sourceFileId,
      });

      if (!completed.ok) {
        patch(id, { state: "error", message: completed.error.message });
        return;
      }

      patch(id, { state: "done" });
      router.refresh();
    },
    [languageId, classSessionId, patch, router],
  );

  /**
   * A file past the limit is not simply refused.
   *
   * What makes a handout 200 MB is scanned pages at 600 DPI, and the reader
   * usually cannot get a smaller copy — the teacher sent that one. Offering to
   * shrink it is the difference between using the app and not.
   */
  const compress = useCallback(
    async (id: string, file: File) => {
      setOversized((current) =>
        current.map((entry) =>
          entry.id === id
            ? { ...entry, state: "working", note: "Starting…" }
            : entry,
        ),
      );

      try {
        const result: CompressResult = await compressPdf(file, {
          targetBytes: maxBytes,
          onProgress: ({ page, pages }) =>
            setOversized((current) =>
              current.map((entry) =>
                entry.id === id
                  ? { ...entry, note: `Page ${page} of ${pages}…` }
                  : entry,
              ),
            ),
        });

        if (result.bytes > maxBytes) {
          setOversized((current) =>
            current.map((entry) =>
              entry.id === id
                ? {
                    ...entry,
                    state: "asking",
                    note: `Only got down to ${formatBytes(result.bytes)}, still over the ${formatBytes(maxBytes)} limit. This file will not compress much further — it is probably not scanned pages.`,
                  }
                : entry,
            ),
          );
          return;
        }

        setOversized((current) => current.filter((entry) => entry.id !== id));
        void uploadOne(result.file);
      } catch (error) {
        setOversized((current) =>
          current.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  state: "asking",
                  note:
                    error instanceof Error
                      ? `That did not work: ${error.message}`
                      : "That did not work.",
                }
              : entry,
          ),
        );
      }
    },
    [maxBytes, uploadOne],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      for (const file of Array.from(files)) {
        if (file.size > maxBytes) {
          // Checked here as well as at presign. The server is the authority,
          // but finding out after a 200 MB upload attempt is not an answer.
          setOversized((current) => [
            ...current,
            { id: uuid(), file, state: "asking" },
          ]);
          continue;
        }
        void uploadOne(file);
      }
    },
    [maxBytes, uploadOne],
  );

  if (!online) {
    /*
     * An upload needs a presigned URL, and a presigned URL needs the server.
     * Queueing the file would mean holding a 150 MB blob in IndexedDB against
     * a URL that has to be requested later anyway — so the honest answer is
     * to say it needs a connection rather than accept a file that will sit
     * there.
     */
    return (
      <div
        className={cn(
          "rounded-md border-2 border-dashed border-hairline-strong bg-surface px-6 py-8 text-center",
          className,
        )}
      >
        <p className="text-label text-ink">Uploading needs a connection</p>
        <p className="mt-1 text-body-sm text-ink-2">
          Everything else keeps working — open a document you have kept offline,
          write in it, and it will sync when you are back.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-md border-2 border-dashed px-6 py-8 text-center transition-colors duration-[120ms]",
          dragging
            ? "border-accent bg-accent-soft"
            : "border-hairline-strong bg-surface",
        )}
      >
        <UploadIcon className="size-7 text-ink-3" />
        <div>
          <p className="text-label text-ink">
            Drop a handout here, or choose a file
          </p>
          <p className="mt-1 text-body-sm text-ink-2">
            PDF, Word, PowerPoint, images or plain text. Everything becomes a
            PDF you can mark up — the original is kept.
          </p>
        </div>

        <Button
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          Choose a file
        </Button>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>

      {oversized.map((entry) => (
        <div
          key={entry.id}
          className="mt-3 rounded-md border border-warning bg-warning-soft p-3 text-warning-on-soft"
        >
          <p className="text-label">
            {entry.file.name} is {formatBytes(entry.file.size)}
          </p>

          <p className="mt-1 text-body-sm">
            The limit is {formatBytes(maxBytes)}.
            {canCompress(entry.file)
              ? " It can be compressed here, in your browser — nothing is uploaded until it fits."
              : " Only PDFs can be compressed here, so this one has to be made smaller before uploading."}
          </p>

          {canCompress(entry.file) ? (
            <p className="mt-1.5 text-caption">
              Compressing re-draws every page as an image, so text stops being
              selectable and the file usually gets several times smaller. You
              can run <strong>Read the text</strong> on it afterwards to make it
              searchable again.
            </p>
          ) : null}

          {entry.note ? (
            <p className="mt-1.5 text-caption">{entry.note}</p>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-2">
            {canCompress(entry.file) ? (
              <Button
                size="sm"
                loading={entry.state === "working"}
                onClick={() => void compress(entry.id, entry.file)}
              >
                Compress and upload
              </Button>
            ) : null}

            <Button
              size="sm"
              variant="ghost"
              disabled={entry.state === "working"}
              onClick={() =>
                setOversized((current) =>
                  current.filter((item) => item.id !== entry.id),
                )
              }
            >
              {entry.state === "working" ? "Working…" : "Cancel"}
            </Button>
          </div>
        </div>
      ))}

      {uploads.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {uploads.map((upload) => (
            <li key={upload.id}>
              {upload.state === "error" ? (
                <Banner tone="danger">
                  <strong>{upload.name}</strong> — {upload.message}
                </Banner>
              ) : (
                <div className="rounded-sm border border-hairline bg-surface px-3 py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-body-sm text-ink">
                      {upload.name}
                    </span>
                    <span className="shrink-0 text-caption text-ink-2">
                      {upload.state === "uploading"
                        ? `${upload.progress}%`
                        : upload.state === "converting"
                          ? "converting…"
                          : "ready"}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-inset">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-[180ms]"
                      style={{
                        width:
                          upload.state === "uploading"
                            ? `${upload.progress}%`
                            : "100%",
                      }}
                    />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
