"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Banner, Button } from "@/components/ui";
import { UploadIcon } from "@/components/nav/icons";
import { cn } from "@/lib/cn";

/**
 * Upload dropzone.
 *
 * Implements the two-step flow from API.md: presign, PUT **straight to object
 * storage**, then complete. The bytes never touch the Node process, which is
 * what lets a 50 MB deck upload without the web container growing.
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
  className,
}: {
  languageId: string;
  classSessionId?: string;
  className?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);

  const patch = useCallback((id: string, next: Partial<Upload>) => {
    setUploads((current) =>
      current.map((upload) =>
        upload.id === id ? { ...upload, ...next } : upload,
      ),
    );
  }, []);

  const uploadOne = useCallback(
    async (file: File) => {
      const id = crypto.randomUUID();
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
          message: "The upload did not finish. Check your connection.",
        });
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

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      for (const file of Array.from(files)) {
        void uploadOne(file);
      }
    },
    [uploadOne],
  );

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
