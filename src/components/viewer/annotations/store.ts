"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { OutboxQueue, type SyncState } from "@/lib/outbox/queue";
import { uuid } from "@/lib/uuid";
import type { HighlightKey, InkKey } from "@/lib/tokens";

/**
 * The annotation store.
 *
 * ANNOTATION_ENGINE.md §9: annotations for a document are fetched **once** and
 * held in a normalised `Map<leafId, Annotation[]>`. Per-page fetching causes a
 * request storm on fast scroll, which is the single easiest way to make the
 * viewer feel broken.
 *
 * Every mutation follows the five steps in §7: generate a clientId, apply to
 * memory immediately, queue durably, batch-POST, reconcile.
 */

export type Annotation = {
  clientId: string;
  id?: string;
  leafId: string;
  kind:
    | "HIGHLIGHT"
    | "UNDERLINE"
    | "STRIKETHROUGH"
    | "INK"
    | "TEXT_BOX"
    | "SHAPE"
    | "COMMENT_PIN";
  color: HighlightKey | InkKey;
  opacity: number;
  zIndex: number;
  geometry: Record<string, unknown>;
  quotedText?: string | null;
  deletedAt?: string | null;
};

type UndoEntry =
  | { type: "create"; clientId: string }
  | { type: "delete"; annotation: Annotation }
  | { type: "update"; before: Annotation };

const UNDO_DEPTH = 50;

export function useAnnotations(documentId: string) {
  const [byLeaf, setByLeaf] = useState<Map<string, Annotation[]>>(new Map());
  const [sync, setSync] = useState<SyncState>({ status: "synced" });
  const [loaded, setLoaded] = useState(false);

  const queueRef = useRef<OutboxQueue | null>(null);
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);

  if (!queueRef.current) queueRef.current = new OutboxQueue(documentId);
  const queue = queueRef.current;

  useEffect(() => {
    const unsubscribe = queue.subscribe(setSync);
    return () => {
      unsubscribe();
    };
  }, [queue]);

  // Fetched once per document. Not per page.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await api.get<{ items: Annotation[] }>(
        `/api/documents/${documentId}/annotations`,
      );
      if (cancelled || !result.ok) {
        setLoaded(true);
        return;
      }

      const next = new Map<string, Annotation[]>();
      for (const item of result.data.items) {
        if (item.deletedAt) continue;
        const list = next.get(item.leafId) ?? [];
        list.push(item);
        next.set(item.leafId, list);
      }

      setByLeaf(next);
      setLoaded(true);

      // Anything still in the outbox from a previous session goes out now.
      void queue.flush();
    })();

    return () => {
      cancelled = true;
    };
  }, [documentId, queue]);

  const applyLocal = useCallback((annotation: Annotation) => {
    setByLeaf((current) => {
      const next = new Map(current);
      const list = [...(next.get(annotation.leafId) ?? [])];
      const index = list.findIndex(
        (entry) => entry.clientId === annotation.clientId,
      );
      if (index >= 0) list[index] = annotation;
      else list.push(annotation);
      next.set(annotation.leafId, list);
      return next;
    });
  }, []);

  const removeLocal = useCallback((clientId: string, leafId: string) => {
    setByLeaf((current) => {
      const next = new Map(current);
      next.set(
        leafId,
        (next.get(leafId) ?? []).filter((entry) => entry.clientId !== clientId),
      );
      return next;
    });
  }, []);

  const create = useCallback(
    (input: Omit<Annotation, "clientId"> & { clientId?: string }) => {
      const annotation: Annotation = {
        ...input,
        clientId: input.clientId ?? uuid(),
      };

      // Step 2: the mark appears instantly. No await, no spinner.
      applyLocal(annotation);

      undoStack.current.push({ type: "create", clientId: annotation.clientId });
      if (undoStack.current.length > UNDO_DEPTH) undoStack.current.shift();
      redoStack.current = [];

      void queue.push({
        op: "create",
        clientId: annotation.clientId,
        kind: annotation.kind,
        leafId: annotation.leafId,
        color: annotation.color,
        opacity: annotation.opacity,
        zIndex: annotation.zIndex,
        geometry: annotation.geometry,
        ...(annotation.quotedText ? { quotedText: annotation.quotedText } : {}),
      });

      return annotation;
    },
    [applyLocal, queue],
  );

  const remove = useCallback(
    (annotation: Annotation) => {
      removeLocal(annotation.clientId, annotation.leafId);

      undoStack.current.push({ type: "delete", annotation });
      if (undoStack.current.length > UNDO_DEPTH) undoStack.current.shift();
      redoStack.current = [];

      void queue.push({ op: "delete", clientId: annotation.clientId });
    },
    [queue, removeLocal],
  );

  const update = useCallback(
    (annotation: Annotation, changes: Partial<Annotation>) => {
      undoStack.current.push({ type: "update", before: annotation });
      if (undoStack.current.length > UNDO_DEPTH) undoStack.current.shift();
      redoStack.current = [];

      const next = { ...annotation, ...changes };
      applyLocal(next);

      void queue.push({
        op: "update",
        clientId: annotation.clientId,
        ...(changes.color ? { color: changes.color } : {}),
        ...(changes.opacity != null ? { opacity: changes.opacity } : {}),
        ...(changes.geometry ? { geometry: changes.geometry } : {}),
      });
    },
    [applyLocal, queue],
  );

  /**
   * Undo of a create issues a DELETE with the same clientId
   * (ANNOTATION_ENGINE.md §7), which is why the stack stores ids rather than
   * inverse operations.
   */
  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;

    if (entry.type === "create") {
      let found: Annotation | undefined;
      for (const list of byLeaf.values()) {
        found = list.find((item) => item.clientId === entry.clientId);
        if (found) break;
      }
      if (found) {
        removeLocal(found.clientId, found.leafId);
        void queue.push({ op: "delete", clientId: found.clientId });
        redoStack.current.push({ type: "delete", annotation: found });
      }
      return;
    }

    if (entry.type === "delete") {
      applyLocal(entry.annotation);
      void queue.push({
        op: "create",
        clientId: entry.annotation.clientId,
        kind: entry.annotation.kind,
        leafId: entry.annotation.leafId,
        color: entry.annotation.color,
        opacity: entry.annotation.opacity,
        zIndex: entry.annotation.zIndex,
        geometry: entry.annotation.geometry,
      });
      redoStack.current.push({
        type: "create",
        clientId: entry.annotation.clientId,
      });
      return;
    }

    applyLocal(entry.before);
    void queue.push({
      op: "update",
      clientId: entry.before.clientId,
      color: entry.before.color,
      opacity: entry.before.opacity,
      geometry: entry.before.geometry,
    });
  }, [applyLocal, byLeaf, queue, removeLocal]);

  const forLeaf = useCallback(
    (leafId: string): Annotation[] => byLeaf.get(leafId) ?? [],
    [byLeaf],
  );

  const all = useMemo(() => [...byLeaf.values()].flat(), [byLeaf]);

  return {
    loaded,
    sync,
    forLeaf,
    all,
    create,
    update,
    remove,
    undo,
    canUndo: undoStack.current.length > 0,
  };
}
