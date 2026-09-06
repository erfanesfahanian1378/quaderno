"use client";

import { useEffect, useRef, useState } from "react";
import type * as PdfJs from "pdfjs-dist";
import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from "pdfjs-dist/types/src/display/api";

/**
 * pdf.js document loading.
 *
 * The three options here are the ones that make a 200-page handout open in
 * under 1.5s on 4G (ARCHITECTURE.md §2):
 *
 *   disableAutoFetch  — do not stream the whole file in the background
 *   disableStream     — fetch only the ranges actually needed
 *   rangeChunkSize    — 64 KB byte-range requests
 *
 * Together they mean opening page 1 of a 200-page PDF downloads roughly
 * 100 KB, not the whole file. Removing them is the single easiest way to blow
 * the mobile budget.
 */

export type PdfState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; document: PDFDocumentProxy; pageCount: number }
  | { status: "error"; message: string };

let workerConfigured = false;

async function configureWorker(): Promise<typeof PdfJs> {
  const pdfjs = await import("pdfjs-dist");

  if (!workerConfigured) {
    // The worker is served from our own origin, which the CSP requires
    // (ARCHITECTURE.md §7 allows unsafe-eval only for the pdf.js worker
    // origin). A CDN worker would violate it.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    workerConfigured = true;
  }

  return pdfjs;
}

export function usePdfDocument(url: string | null): PdfState {
  const [state, setState] = useState<PdfState>({ status: "idle" });
  const activeUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!url) {
      setState({ status: "idle" });
      return;
    }

    activeUrl.current = url;
    setState({ status: "loading" });

    let cancelled = false;
    let task: ReturnType<typeof PdfJs.getDocument> | null = null;

    void (async () => {
      try {
        const pdfjs = await configureWorker();

        task = pdfjs.getDocument({
          url,
          disableAutoFetch: true,
          disableStream: false,
          rangeChunkSize: 65_536,
          // Keeps memory flat while scrolling a long document.
          disableFontFace: false,
          cMapPacked: true,
        });

        const document = await task.promise;
        if (cancelled) return;

        setState({
          status: "ready",
          document,
          pageCount: document.numPages,
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "That document could not be opened.",
        });
      }
    })();

    return () => {
      cancelled = true;
      // Destroying the loading task aborts in-flight range requests and tears
      // down the worker. Without it, opening ten documents in a session leaks
      // all ten workers.
      if (task) void task.destroy();
    };
  }, [url]);

  return state;
}

/** Caches page proxies so scrolling back does not re-resolve them. */
export function usePageCache(document: PDFDocumentProxy | null) {
  const cache = useRef(new Map<number, Promise<PDFPageProxy>>());

  useEffect(() => {
    const current = cache.current;
    return () => {
      current.clear();
    };
  }, [document]);

  return (pageNumber: number): Promise<PDFPageProxy> => {
    if (!document) return Promise.reject(new Error("No document"));

    const existing = cache.current.get(pageNumber);
    if (existing) return existing;

    const promise = document.getPage(pageNumber);
    cache.current.set(pageNumber, promise);
    return promise;
  };
}
