"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { Banner, Button } from "@/components/ui";

/**
 * The OCR offer.
 *
 * Dismissible and shown once, not a modal (ANNOTATION_ENGINE.md §3): a scan
 * is still perfectly usable without it — you can draw on it, insert pages
 * beside it and export it — so this is an enhancement, not a blocker.
 */
export function OcrOffer({ documentId }: { documentId: string }) {
  const [state, setState] = useState<
    "offered" | "queued" | "dismissed" | "error"
  >("offered");
  const [message, setMessage] = useState<string | null>(null);

  if (state === "dismissed") return null;

  if (state === "queued") {
    return (
      <Banner tone="info">
        Reading the text on this scan. It takes a minute or two — you can leave
        this page and come back.
      </Banner>
    );
  }

  return (
    <Banner tone={state === "error" ? "warning" : "info"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {message ??
            "This looks like a scan, so there is no text to select yet. Reading it makes it highlightable and searchable."}
        </span>
        <span className="flex shrink-0 gap-2">
          <Button
            size="sm"
            onClick={() => {
              void api
                .post(`/api/documents/${documentId}/ocr`)
                .then((result) => {
                  if (result.ok) setState("queued");
                  else {
                    setMessage(result.error.message);
                    setState("error");
                  }
                });
            }}
          >
            Read the text
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setState("dismissed")}
          >
            Not now
          </Button>
        </span>
      </div>
    </Banner>
  );
}
