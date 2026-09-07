"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePdfDocument, usePageCache } from "./usePdfDocument";
import { useRenderWindow } from "./useRenderWindow";
import { usePrint } from "./usePrint";
import { PdfPage } from "./PdfPage";
import { ThumbnailRail } from "./ThumbnailRail";
import { ViewerHeader } from "./ViewerHeader";
import { NotePageView } from "./NotePageView";
import { TemplatePicker, type TemplateKey } from "./TemplatePicker";
import { Banner } from "@/components/ui";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useAnnotations } from "./annotations/store";
import { AnnotationLayer } from "./annotations/AnnotationLayer";
import { AnnotationToolbar, type Tool } from "./annotations/Toolbar";
import { SelectionPopover } from "./annotations/SelectionPopover";
import { useTextSelection } from "./annotations/useTextSelection";
import { CreationSurface } from "./annotations/CreationSurface";
import {
  InlineComposer,
  type ComposerResult,
  type InlineComposerHandle,
} from "./annotations/InlineComposer";
import { PronouncePanel } from "./PronouncePanel";
import { RightRail } from "./RightRail";
import { OcrOffer } from "./OcrOffer";
import { useInkCapture } from "./ink/useInkCapture";
import {
  HIGHLIGHT_DEFAULT_LABELS,
  INK_WIDTHS,
  type HighlightKey,
  type InkKey,
  type InkWidthKey,
} from "@/lib/tokens";
import { renderedSize, type PageGeometry } from "./coords";

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
  /** ISO 639-1, for picking a read-aloud voice in the right accent. */
  languageCode: string;
  hasTextLayer: boolean;
  leafCount: number;
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
  const router = useRouter();
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

      /*
       * Handed to pdf.js exactly as signed.
       *
       * There was a marker query parameter here so the service worker could
       * recognise the request. It cannot go in the URL: SigV4 signs the whole
       * query string, so the extra parameter turned every page fetch into a
       * 403. The worker matches on the object's pathname instead (public/sw.js).
       */
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

  const { visible, isInWindow } = useRenderWindow(scrollRef, leaves.length);
  const printing = usePrint(scrollRef, leaves.length);

  // --- Annotations --------------------------------------------------------

  const annotations = useAnnotations(doc.id);
  const [tool, setTool] = useState<Tool>("select");
  const [highlightColor, setHighlightColor] =
    useState<HighlightKey>("hl-yellow");
  const [inkColor, setInkColor] = useState<InkKey>("ink-black");
  const [inkWidth, setInkWidth] = useState<InkWidthKey>("medium");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [shape, setShape] = useState<"rect" | "ellipse" | "line" | "arrow">(
    "rect",
  );
  const composerRef = useRef<InlineComposerHandle>(null);
  const [pronounceOpen, setPronounceOpen] = useState(false);
  const [railOpenRight, setRailOpenRight] = useState(false);
  const [pronounceText, setPronounceText] = useState("");

  // Insert-a-page: the rail asks, the picker chooses, the server places it.
  const [insertAfter, setInsertAfter] = useState<{
    leafId: string | null;
  } | null>(null);

  const insertPage = useCallback(
    async (template: TemplateKey) => {
      const target = insertAfter;
      setInsertAfter(null);
      if (!target) return;

      const result = await api.post(`/api/documents/${doc.id}/leaves`, {
        kind: "NOTE_PAGE",
        afterLeafId: target.leafId,
        template,
      });

      // The page list is server-rendered, so a refresh is what shows the new
      // page in the scroll flow.
      if (result.ok) router.refresh();
    },
    [doc.id, insertAfter, router],
  );

  // Page geometries, keyed by leaf, so selection and ink can convert
  // coordinates without walking the DOM.
  const geometries = useRef(new Map<string, PageGeometry>());
  const geometryFor = useCallback(
    (leafId: string) => geometries.current.get(leafId) ?? null,
    [],
  );

  const { selection, clear: clearSelection } = useTextSelection(
    scrollRef,
    geometryFor,
    tool === "select",
  );

  const addTextMark = useCallback(
    (
      kind: "HIGHLIGHT" | "UNDERLINE" | "STRIKETHROUGH",
      color: HighlightKey,
    ) => {
      if (!selection) return;

      annotations.create({
        kind,
        leafId: selection.leafId,
        color,
        opacity: kind === "HIGHLIGHT" ? 0.4 : 1,
        zIndex: 0,
        geometry: { quads: selection.quads },
        quotedText: selection.quotedText,
      });

      clearSelection();
    },
    [annotations, clearSelection, selection],
  );

  const ink = useInkCapture({
    enabled: tool === "pen",
    width: INK_WIDTHS[inkWidth],
    onStrokeComplete: (leafId, stroke) => {
      // One annotation per stroke, not per gesture group — undo then removes
      // one stroke, which is what people expect from a pen.
      annotations.create({
        kind: "INK",
        leafId,
        color: inkColor,
        opacity: 1,
        zIndex: 1,
        geometry: { strokes: [stroke] },
      });
    },
  });

  /**
   * Drag-to-highlight. This is what the highlight TOOL does — press, drag
   * across the words, release — as opposed to the selection popover, which
   * still handles the desktop "select text first" habit.
   */
  const createHighlightFromDrag = useCallback(
    (
      leafId: string,
      quads: { x: number; y: number; w: number; h: number }[],
      quotedText: string,
    ) => {
      annotations.create({
        kind: "HIGHLIGHT",
        leafId,
        color: highlightColor,
        opacity: 0.4,
        zIndex: 0,
        geometry: { quads },
        quotedText,
      });

      // Whatever you just marked becomes what the read-aloud panel offers,
      // so highlighting a word and hearing it is two taps.
      if (quotedText) setPronounceText(quotedText);
    },
    [annotations, highlightColor],
  );

  const createShape = useCallback(
    (
      leafId: string,
      shapeGeometry: {
        shape: string;
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        strokeW: number;
      },
    ) => {
      annotations.create({
        kind: "SHAPE",
        leafId,
        color: inkColor,
        opacity: 1,
        zIndex: 1,
        geometry: shapeGeometry,
      });
    },
    [annotations, inkColor],
  );

  const onComposerCommit = useCallback(
    (result: ComposerResult) => {
      if (result.kind === "comment") {
        // A pin carries the note as its own comment thread.
        const pin = annotations.create({
          kind: "COMMENT_PIN",
          leafId: result.leafId,
          color: inkColor,
          opacity: 1,
          zIndex: 2,
          geometry: { x: result.x, y: result.y },
        });

        void api.post(`/api/documents/${doc.id}/comments`, {
          body: result.text,
          leafId: result.leafId,
          ...(pin.id ? { annotationId: pin.id } : {}),
        });
        return;
      }

      annotations.create({
        kind: "TEXT_BOX",
        leafId: result.leafId,
        color: inkColor,
        opacity: 1,
        zIndex: 2,
        geometry: {
          x: result.x,
          y: result.y,
          w: result.width,
          h: result.height,
          text: result.text,
          // Omitted entirely when the note is unformatted, so a plain note
          // stays a plain row rather than carrying a redundant span list.
          ...(result.spans && result.spans.length > 0
            ? { spans: result.spans }
            : {}),
          fontSize: 0.022,
          align: "left",
        },
      });
    },
    [annotations, doc.id, inkColor],
  );

  /**
   * Commit a dragged mark.
   *
   * One update at the end of the gesture, not one per frame: the drag itself
   * is local state inside the mark (see useDragToMove), so the outbox sees a
   * single row for a move that took a second and a hundred pointer events.
   */
  const onAnnotationMove = useCallback(
    (annotation: { clientId: string }, x: number, y: number) => {
      const found = annotations.all.find(
        (item) => item.clientId === annotation.clientId,
      );
      if (!found) return;

      annotations.update(found, {
        geometry: { ...found.geometry, x, y },
      });
    },
    [annotations],
  );

  const onAnnotationClick = useCallback(
    (annotation: { clientId: string }) => {
      if (tool === "eraser") {
        const found = annotations.all.find(
          (item) => item.clientId === annotation.clientId,
        );
        // Stroke eraser: the whole intersecting annotation goes. Pixel eraser
        // is explicitly deferred (ANNOTATION_ENGINE.md §4).
        if (found) annotations.remove(found);
        return;
      }
      setSelectedClientId(annotation.clientId);
    },
    [annotations, tool],
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

  const jumpToLeaf = useCallback(
    (leafId: string) => {
      const index = leaves.findIndex((leaf) => leaf.id === leafId);
      if (index < 0) return;

      const target = scrollRef.current?.querySelector(
        `[data-page-index="${index + 1}"]`,
      );
      target?.scrollIntoView({ behavior: "smooth", block: "start" });

      // Pulse the page so the eye lands on the right one.
      const page = target?.querySelector(`[data-leaf-id="${leafId}"]`);
      if (page instanceof HTMLElement) {
        page.classList.add("ring-2", "ring-accent");
        setTimeout(() => page.classList.remove("ring-2", "ring-accent"), 900);
      }

      // On a phone the sheet covers the page it just scrolled to.
      if (window.innerWidth < 1024) setRailOpenRight(false);
    },
    [leaves],
  );

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
      } else if ((event.metaKey || event.ctrlKey) && event.key === "z") {
        event.preventDefault();
        annotations.undo();
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
  }, [annotations, jumpTo, leaves.length, visible]);

  // Tell the server it was opened. A beacon, so it survives the page closing.
  useEffect(() => {
    const url = `/api/documents/${doc.id}/opened`;
    if (navigator.sendBeacon) navigator.sendBeacon(url);
    else void fetch(url, { method: "POST", keepalive: true });
  }, [doc.id]);

  return (
    <div
      data-viewer=""
      data-accent={doc.languageAccent}
      className="flex h-dvh flex-col bg-canvas"
    >
      <ViewerHeader
        syncState={annotations.sync}
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
        onPrint={() => void printing.print()}
        printState={printing}
        railOpen={railOpen}
        onToggleRail={() => setRailOpen((open) => !open)}
        panelOpen={railOpenRight}
        onTogglePanel={() => setRailOpenRight((open) => !open)}
        markCount={
          annotations.all.filter((a) =>
            ["HIGHLIGHT", "UNDERLINE", "STRIKETHROUGH"].includes(a.kind),
          ).length
        }
      />

      <div data-print-keep="" className="flex min-h-0 flex-1">
        {railOpen ? (
          <ThumbnailRail
            leaves={leaves}
            activeIndex={visible}
            onJump={jumpTo}
            getPage={getPage}
            ready={pdf.status === "ready"}
            onInsertAfter={(leafId) => setInsertAfter({ leafId })}
          />
        ) : null}

        <div
          ref={scrollRef}
          data-print-keep=""
          className="min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6"
        >
          {loadError ? (
            <div className="mx-auto max-w-[560px]">
              <Banner tone="danger">{loadError}</Banner>
            </div>
          ) : null}

          {!doc.hasTextLayer && doc.status === "READY" ? (
            <div className="mx-auto mb-4 max-w-[720px]">
              <OcrOffer documentId={doc.id} />
            </div>
          ) : null}

          <div data-print-keep="" className="flex flex-col items-center gap-6">
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
                      languageCode={doc.languageCode}
                    />
                  ) : pdf.status === "ready" ? (
                    <PdfPage
                      pageNumber={(leaf.sourcePageIndex ?? 0) + 1}
                      getPage={getPage}
                      scale={zoom}
                      rotation={leaf.rotation}
                      active={isInWindow(pageNumber) || printing.printAll}
                      label={leaf.label ?? String(pageNumber)}
                      leafId={leaf.id}
                      interaction={
                        // Only plain select keeps the text layer live now:
                        // the highlight tool drags on its own surface.
                        tool === "select" ? "text" : "draw"
                      }
                      onGeometry={(geometry) =>
                        geometries.current.set(leaf.id, geometry)
                      }
                    >
                      {(geometry) => (
                        <>
                          <AnnotationLayer
                            annotations={annotations.forLeaf(leaf.id)}
                            geometry={geometry}
                            onSelect={onAnnotationClick}
                            onMove={onAnnotationMove}
                            // Only with the select tool. Dragging a note
                            // while the pen is out would mean every stroke
                            // that starts on a note moves it instead.
                            movable={tool === "select"}
                            selectedClientId={selectedClientId}
                          />

                          {/* The ink capture surface, above the marks. */}
                          {tool === "pen" ? (
                            <svg
                              className="absolute inset-0 z-30 size-full touch-none"
                              style={{ color: `var(--${inkColor})` }}
                              onPointerDown={(event) =>
                                ink.handlers.onPointerDown(
                                  event,
                                  leaf.id,
                                  geometry,
                                )
                              }
                              onPointerMove={ink.handlers.onPointerMove}
                              onPointerUp={ink.handlers.onPointerUp}
                              onPointerCancel={ink.handlers.onPointerCancel}
                            />
                          ) : null}

                          {/*
                            Everything that is not the pen and not plain
                            selection: drag to highlight, drag a shape, tap to
                            place a text box or a comment pin.
                          */}
                          {tool === "highlight" ||
                          tool === "shape" ||
                          tool === "text" ||
                          tool === "comment" ? (
                            <CreationSurface
                              tool={tool}
                              leafId={leaf.id}
                              geometry={geometry}
                              highlightColor={highlightColor}
                              inkColor={inkColor}
                              shape={shape}
                              onHighlight={createHighlightFromDrag}
                              onShape={createShape}
                              /*
                                Both call the composer SYNCHRONOUSLY from the
                                pointerdown handler. Anything deferred — even
                                one frame — and the mobile keyboard opens and
                                immediately dismisses itself.
                              */
                              onTextBox={(leafId, x, y) =>
                                composerRef.current?.open({
                                  kind: "text",
                                  leafId,
                                  x,
                                  y,
                                  pageWidth: renderedSize(geometry).width,
                                  pageHeight: renderedSize(geometry).height,
                                })
                              }
                              onCommentPin={(leafId, x, y) =>
                                composerRef.current?.open({
                                  kind: "comment",
                                  leafId,
                                  x,
                                  y,
                                  pageWidth: renderedSize(geometry).width,
                                  pageHeight: renderedSize(geometry).height,
                                })
                              }
                            />
                          ) : null}
                        </>
                      )}
                    </PdfPage>
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

        <RightRail
          document={doc}
          annotations={annotations.all}
          open={railOpenRight}
          onClose={() => setRailOpenRight(false)}
          onJumpToLeaf={jumpToLeaf}
          labels={HIGHLIGHT_DEFAULT_LABELS}
        />
      </div>

      {insertAfter ? (
        <TemplatePicker
          onPick={(template) => void insertPage(template)}
          onCancel={() => setInsertAfter(null)}
        />
      ) : null}

      {selection && tool === "select" ? (
        <SelectionPopover
          selection={selection}
          labels={HIGHLIGHT_DEFAULT_LABELS}
          onHighlight={(color) => {
            setHighlightColor(color);
            addTextMark("HIGHLIGHT", color);
          }}
          onUnderline={() => addTextMark("UNDERLINE", highlightColor)}
          onStrikethrough={() => addTextMark("STRIKETHROUGH", highlightColor)}
          onComment={() => addTextMark("HIGHLIGHT", highlightColor)}
          onDismiss={clearSelection}
        />
      ) : null}

      <InlineComposer
        ref={composerRef}
        color={inkColor}
        onCommit={onComposerCommit}
      />

      <PronouncePanel
        languageCode={doc.languageCode}
        open={pronounceOpen}
        initialText={pronounceText}
        onClose={() => setPronounceOpen(false)}
      />

      <AnnotationToolbar
        tool={tool}
        onToolChange={setTool}
        highlightColor={highlightColor}
        onHighlightColor={setHighlightColor}
        inkColor={inkColor}
        onInkColor={setInkColor}
        inkWidth={inkWidth}
        onInkWidth={setInkWidth}
        shape={shape}
        onShapeChange={setShape}
        onUndo={annotations.undo}
        canUndo={annotations.canUndo}
        onPronounce={() => setPronounceOpen((value) => !value)}
        pronounceOpen={pronounceOpen}
        labels={HIGHLIGHT_DEFAULT_LABELS}
      />

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
