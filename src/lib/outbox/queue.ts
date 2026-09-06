"use client";

import { api } from "@/lib/api-client";
import * as db from "./db";

/**
 * The flush loop.
 *
 * ANNOTATION_ENGINE.md §7, steps 4 and 5: batched with a 400 ms debounce, at
 * most 50 ops, and on failure kept with exponential backoff and jitter capped
 * at five minutes.
 *
 * The jitter matters more than it looks: without it, every tab that lost
 * connection at the same moment retries at the same moment, and the server
 * gets a thundering herd the instant the network returns.
 */

const DEBOUNCE_MS = 400;
const MAX_OPS = 50;
const MAX_BACKOFF_MS = 5 * 60_000;

export type SyncState =
  | { status: "synced" }
  | { status: "pending"; count: number }
  | { status: "offline"; count: number }
  | { status: "error"; count: number; message: string };

type Listener = (state: SyncState) => void;

export class OutboxQueue {
  private readonly documentId: string;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private failures = 0;

  constructor(documentId: string) {
    this.documentId = documentId;

    if (typeof window !== "undefined") {
      // Coming back online is the moment to retry, not the next debounce tick.
      window.addEventListener("online", () => void this.flush());
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    void this.emit();
    return () => this.listeners.delete(listener);
  }

  private async emit(override?: SyncState): Promise<void> {
    const state =
      override ??
      (await (async (): Promise<SyncState> => {
        const count = await db.count(this.documentId);
        if (count === 0) return { status: "synced" };
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          return { status: "offline", count };
        }
        return { status: "pending", count };
      })());

    for (const listener of this.listeners) listener(state);
  }

  /** Queue an op and schedule a flush. Returns as soon as it is durable. */
  async push(
    op: Record<string, unknown> & { clientId: string },
  ): Promise<void> {
    if (!db.isAvailable()) {
      // Without IndexedDB there is no durability, but the write must still go
      // out — better a mark that survives only the session than none at all.
      this.schedule();
      return;
    }

    await db.enqueue({
      clientId: op.clientId,
      documentId: this.documentId,
      op,
      queuedAt: Date.now(),
      attempts: 0,
    });

    void this.emit();
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), DEBOUNCE_MS);
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;

    try {
      const entries = (await db.pending(this.documentId)).slice(0, MAX_OPS);
      if (entries.length === 0) {
        this.failures = 0;
        await this.emit({ status: "synced" });
        return;
      }

      const result = await api.post<{
        results: {
          clientId: string;
          ok: boolean;
          error?: { message: string };
        }[];
      }>(`/api/documents/${this.documentId}/annotations/batch`, {
        ops: entries.map((entry) => entry.op),
      });

      if (!result.ok) {
        this.failures += 1;
        await db.bumpAttempts(entries.map((entry) => entry.clientId));

        await this.emit(
          result.error.code === "NETWORK"
            ? { status: "offline", count: entries.length }
            : {
                status: "error",
                count: entries.length,
                message: result.error.message,
              },
        );

        this.retryLater();
        return;
      }

      this.failures = 0;

      // Drop what succeeded. A failed op stays queued and is retried, EXCEPT
      // a validation failure, which will never succeed and would otherwise
      // block the queue forever.
      const settled = result.data.results
        .filter((entry) => entry.ok)
        .map((entry) => entry.clientId);

      const permanentlyFailed = result.data.results
        .filter((entry) => !entry.ok)
        .map((entry) => entry.clientId);

      await db.remove([...settled, ...permanentlyFailed]);

      await this.emit();

      // More than one batch's worth may be queued.
      if ((await db.count(this.documentId)) > 0) this.schedule();
    } finally {
      this.flushing = false;
    }
  }

  /** Exponential backoff with jitter, capped at five minutes. */
  private retryLater(): void {
    const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.failures);
    const jitter = base * 0.3 * Math.random();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), base + jitter);
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.listeners.clear();
  }
}
