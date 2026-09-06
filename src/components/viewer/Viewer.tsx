"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePdfDocument, usePageCache } from "./usePdfDocument";
import { useRenderWindow } from "./useRenderWindow";
import { PdfPage } from "./PdfPage";
import { ThumbnailRail } from "./ThumbnailRail";
import { ViewerHeader } from "./ViewerHeader";
import { NotePageView } from "./NotePageView";
import { Banner } from "@/components/ui";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";

export type ViewerLeaf = {
  id: string;
  kind: "SOURCE_PAGE" | "NOTE_PAGE";
  sourcePageIndex: number | null;
  label: string | null;
  rotation: number;
  notePage: { id: string; content: string } | null;
};

export type ViewerDocument = {
  id: string;
  title: string;
  status: string;
  languageAccent: string;
  hasTextLayer: boolean;
  conversionEngine: string | null;
  originalName: string | null;
};

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export function Viewer({
  document: doc,
  leaves,
}: {
  document: ViewerDocument;
  leaves: ViewerLeaf[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [railOpen, setRailOpen] = useState(true);

  // Fetch the signed URL, and refresh it before its 5-minute expiry so a
  // document left open on a desk does not silently stop loading pages.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const load = async () => {
      const result = await api.get<{ url: string; expiresAt: string }>(
        `/api/documents/${doc.id}/source-url`,
      );

      if (cancelled) return;

      if (!result.ok) {
        setLoadError(result.error.message);
        return;
      }

      setSourceUrl(result.data.url);
      setLoadError(null);

      const expiresIn =
        new Date(result.data.expiresAt).getTime() - Date.now() - 30_000;
      timer = setTimeout(() => void load(), Math.max(30_000, expiresIn));
    };

    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [doc.id]);

  const pdf = usePdfDocument(sourceUrl);
  const getPage = usePageCache(pdf.status === "ready" ? pdf.document : null);

  const { visible, isInWindow } = useRenderWindow(
    scrollRef,
    leaves.length,
  );

  // Fit-width: measure the container and derive a scale from A4's 595pt width.
  useEffect(() => {
    if (!fitWidth) return;
    const container = scrollRef.current;
    if (!container) return;

    const measure = () => {
      const available = container.clientWidth - 64;
      setZoom(Math.min(4, Math.max(0.5, available / 595)));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [fitWidth]);

  const jumpTo = useCallback((index: number) => {
    const container = scrollRef.current;
    const target = container?.querySelector(`[data-page-index="${index}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Keyboard navigation. j/k because this is a reading surface.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      if (event.key === "j" || event.key === "PageDown") {
        jumpTo(Math.min(leaves.length, visible + 1));
      } else if (event.key === "k" || event.key === "PageUp") {
        jumpTo(Math.max(1, visible - 1));
      } else if (event.key === "Home") {
        jumpTo(1);
      } else if (event.key === "End") {
        jumpTo(leaves.length);
      } else if ((event.metaKey || event.ctrlKey) && event.key === "0") {
        event.preventDefault();
        setFitWidth(true);
      } else if ((event.metaKey || event.ctrlKey) && event.key === "=") {
        event.preventDefault();
        setFitWidth(false);
        setZoom((z) => ZOOM_STEPS.find((step) => step > z) ?? z);
      } else if ((event.metaKey || event.ctrlKey) && event.key === "-") {
        event.preventDefault();
        setFitWidth(false);
        setZoom((z) => [...ZOOM_STEPS].reverse().find((s) => s < z) ?? z);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jumpTo, leaves.length, visible]);

  // Tell the server it was opened. A beacon, so it survives the page closing.
  useEffect(() => {
    const url = `/api/documents/${doc.id}/opened`;
    if (navigator.sendBeacon) navigator.sendBeacon(url);
    else void fetch(url, { method: "POST", keepalive: true });
  }, [doc.id]);

  return (
    <div
      data-accent={doc.languageAccent}
      className="flex h-dvh flex-col bg-canvas"
    >
      <ViewerHeader
        document={doc}
        pageNumber={visible}
        pageCount={leaves.length}
        zoom={zoom}
        onZoomIn={() => {
          setFitWidth(false);
          setZoom((z) => ZOOM_STEPS.find((step) => step > z) ?? z);
        }}
        onZoomOut={() => {
          setFitWidth(false);
          setZoom((z) => [...ZOOM_STEPS].reverse().find((s) => s < z) ?? z);
        }}
        onFitWidth={() => setFitWidth(true)}
        railOpen={railOpen}
        onToggleRail={() => setRailOpen((open) => !open)}
      />

      <div className="flex min-h-0 flex-1">
        {railOpen ? (
          <ThumbnailRail
            leaves={leaves}
            activeIndex={visible}
            onJump={jumpTo}
            getPage={getPage}
            ready={pdf.status === "ready"}
          />
        ) : null}

        <div
          ref={scrollRef}
          className="min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6"
        >
          {loadError ? (
            <div className="mx-auto max-w-[560px]">
              <Banner tone="danger">{loadError}</Banner>
            </div>
          ) : null}

          {!doc.hasTextLayer && doc.status === "READY" ? (
            <div className="mx-auto mb-4 max-w-[720px]">
              <Banner tone="info">
                This looks like a scan, so there is no text to select yet.
                Running OCR makes it highlightable.
              </Banner>
            </div>
          ) : null}

          <div className="flex flex-col items-center gap-6">
            {leaves.map((leaf, index) => {
              const pageNumber = index + 1;

              return (
                <div
                  key={leaf.id}
                  data-page-index={pageNumber}
                  className="scroll-mt-4"
                >
                  {leaf.kind === "NOTE_PAGE" ? (
                    <NotePageView
                      leaf={leaf}
                      scale={zoom}
                      label={leaf.label ?? String(pageNumber)}
                    />
                  ) : pdf.status === "ready" ? (
                    <PdfPage
                      pageNumber={(leaf.sourcePageIndex ?? 0) + 1}
                      getPage={getPage}
                      scale={zoom}
                      rotation={leaf.rotation}
                      active={isInWindow(pageNumber)}
                      label={leaf.label ?? String(pageNumber)}
                    />
                  ) : (
                    <PagePlaceholder scale={zoom} label={String(pageNumber)} />
                  )}
                </div>
              );
            })}
          </div>

          {leaves.length === 0 ? (
            <p className="py-16 text-center text-body text-ink-2">
              This document has no pages yet.
            </p>
          ) : null}
        </div>
      </div>

      {/* Page-number pill, fading after a scroll settles. */}
      <div
        className={cn(
          "pointer-events-none fixed bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-ink/85 px-3 py-1.5 text-caption text-ink-inverse shadow-e2 transition-opacity duration-[180ms] lg:bottom-6",
        )}
      >
        {visible} / {leaves.length}
      </div>
    </div>
  );
}

function PagePlaceholder({ scale, label }: { scale: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="page-sheet animate-pulse motion-reduce:animate-none"
        style={{ width: 595 * scale, height: 842 * scale }}
      />
      <span className="text-caption text-ink-3">{label}</span>
    </div>
  );
}
