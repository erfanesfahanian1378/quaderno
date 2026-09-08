"use client";

import { api } from "@/lib/api-client";
import { uuid } from "@/lib/uuid";

/**
 * The general write queue: everything that is not an annotation.
 *
 * The annotation outbox stays exactly as it is. It batches fifty ops into one
 * request against one endpoint, which this cannot do, and rewriting a tested
 * thing so it can share code with an untested one is the wrong trade. This is
 * a second, simpler queue beside it.
 *
 * **Ordered within a stream, parallel across them.** Two edits to the same
 * note page must land in the order they were made or the later one is lost;
 * an edit to a note page and a grade on a card have nothing to do with each
 * other. `stream` is what separates the two cases.
 *
 * Every entry carries its own id as an `Idempotency-Key`, so a retry that
 * arrives after the first attempt already succeeded — the response lost in a
 * tunnel — does nothing the second time. See src/server/api/idempotency.ts.
 */

const DB_NAME = "quaderno-outbox";
const DB_VERSION = 2;
const STORE = "writes";

const MAX_BACKOFF_MS = 5 * 60_000;
/** Past this many failures an entry is a problem to show, not to retry. */
const MAX_ATTEMPTS = 8;

export type QueuedWrite = {
  id: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body: unknown;
  /** Writes sharing a stream flush strictly in order. */
  stream: string;
  /** For the pending list in settings. */
  label: string;
  queuedAt: number;
  attempts: number;
  /**
   * Set when the server said 409. The write is held, not dropped, until the
   * reader says which copy wins.
   */
  conflict?: {
    at: number;
    message: string;
    /** What the server has, so the two can be compared. */
    theirs?: unknown;
  };
};

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    /*
     * Version 2 of the SAME database the annotation outbox uses. Opening one
     * database at two versions from two modules makes whichever opens second
     * throw VersionError, so the upgrade has to create both stores.
     */
    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("ops")) {
        const ops = db.createObjectStore("ops", { keyPath: "clientId" });
        ops.createIndex("documentId", "documentId", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE)) {
        const writes = db.createObjectStore(STORE, { keyPath: "id" });
        writes.createIndex("stream", "stream", { unique: false });
        writes.createIndex("queuedAt", "queuedAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export function isAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = fn(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function all(): Promise<QueuedWrite[]> {
  if (!isAvailable()) return [];
  const rows = await tx<QueuedWrite[]>(
    "readonly",
    (store) => store.getAll() as IDBRequest<QueuedWrite[]>,
  ).catch(() => [] as QueuedWrite[]);
  return rows.sort((a, b) => a.queuedAt - b.queuedAt);
}

async function put(entry: QueuedWrite): Promise<void> {
  await tx("readwrite", (store) => store.put(entry)).catch(() => undefined);
}

export async function remove(id: string): Promise<void> {
  await tx("readwrite", (store) => store.delete(id)).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

type Listener = (writes: QueuedWrite[]) => void;

const listeners = new Set<Listener>();
let flushing = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  void notify();
  return () => listeners.delete(listener);
}

async function notify(): Promise<void> {
  const writes = await all();
  for (const listener of listeners) listener(writes);
}

/**
 * Queue a write and try to send it.
 *
 * Returns once the write is DURABLE, not once it has landed — that is the
 * whole point. The caller applies its optimistic update and carries on.
 */
export async function enqueue(input: {
  method: QueuedWrite["method"];
  path: string;
  body?: unknown;
  stream: string;
  label: string;
}): Promise<string> {
  const entry: QueuedWrite = {
    id: uuid(),
    method: input.method,
    path: input.path,
    body: input.body ?? null,
    stream: input.stream,
    label: input.label,
    queuedAt: Date.now(),
    attempts: 0,
  };

  /*
   * Only the LAST write per stream is kept for a PUT.
   *
   * A note page autosaves every 800 ms. Ten minutes of writing offline is
   * seven hundred queued copies of the same page, of which only the final one
   * matters — and sending the other six hundred and ninety-nine on reconnect
   * would be slow, pointless, and would make the pending count meaningless.
   */
  if (input.method === "PUT") {
    for (const existing of await all()) {
      if (existing.stream === entry.stream && !existing.conflict) {
        await remove(existing.id);
      }
    }
  }

  await put(entry);
  await notify();
  schedule();

  return entry.id;
}

function schedule(delay = 0): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), delay);
}

function retryLater(): void {
  // Exponential with jitter, same as the annotation queue: without the jitter
  // every tab that lost connection at the same moment retries at the same
  // moment.
  const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** failures);
  schedule(base * (0.5 + Math.random()));
}

export async function flush(): Promise<void> {
  if (flushing || !isAvailable()) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  flushing = true;

  try {
    const pending = (await all()).filter((entry) => !entry.conflict);
    if (pending.length === 0) {
      failures = 0;
      return;
    }

    // One per stream per pass, oldest first, so order within a stream holds
    // while unrelated streams still make progress.
    const seen = new Set<string>();
    const batch = pending.filter((entry) => {
      if (seen.has(entry.stream)) return false;
      seen.add(entry.stream);
      return true;
    });

    let networkFailed = false;

    for (const entry of batch) {
      const result = await send(entry);

      if (result === "sent") {
        await remove(entry.id);
        continue;
      }
      if (result === "network") {
        networkFailed = true;
        break;
      }
      // "held" — a conflict or a permanent failure. Already recorded on the
      // entry; leave it and move on rather than blocking the whole queue.
    }

    await notify();

    if (networkFailed) {
      failures += 1;
      retryLater();
    } else {
      failures = 0;
      // More streams may be waiting behind the ones just sent.
      if ((await all()).some((entry) => !entry.conflict)) schedule(50);
    }
  } finally {
    flushing = false;
  }
}

async function send(entry: QueuedWrite): Promise<"sent" | "network" | "held"> {
  const result = await api.request(entry.method, entry.path, entry.body, {
    // The entry's own id: a retry of this exact write is recognised as one.
    "Idempotency-Key": entry.id,
  });

  if (result.ok) return "sent";

  if (result.error.code === "NETWORK") return "network";

  if (result.error.code === "CONFLICT") {
    /*
     * Someone else changed it while this was queued. NEITHER copy is thrown
     * away and neither is forced through — the reader is asked which one
     * wins. Until they answer, the entry stays here and keeps showing in the
     * pending count, so an unanswered conflict is visible rather than
     * forgotten.
     */
    await put({
      ...entry,
      attempts: entry.attempts + 1,
      conflict: {
        at: Date.now(),
        message: result.error.message,
        theirs: (result.error as { details?: unknown }).details,
      },
    });
    return "held";
  }

  const attempts = entry.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    // Retrying for ever hides a write that is never going to land. Hold it
    // and let it show up in the pending list where it can be dealt with.
    await put({
      ...entry,
      attempts,
      conflict: { at: Date.now(), message: result.error.message },
    });
    return "held";
  }

  await put({ ...entry, attempts });
  return "network";
}

/** The reader chose: send mine, overwriting theirs. */
export async function resolveKeepMine(id: string): Promise<void> {
  const entry = (await all()).find((row) => row.id === id);
  if (!entry) return;

  /*
   * Sent WITHOUT the precondition that caused the conflict. The whole point of
   * choosing "keep mine" is to overwrite what is there, and re-sending with
   * the stale timestamp would just conflict again.
   */
  await put({
    ...entry,
    conflict: undefined,
    attempts: 0,
    queuedAt: Date.now(),
  });
  await notify();
  schedule();
}

/** The reader chose: keep what the server has, discard mine. */
export async function resolveKeepTheirs(id: string): Promise<void> {
  await remove(id);
  await notify();
}

if (typeof window !== "undefined") {
  // Coming back is the moment to retry, not the next scheduled tick.
  window.addEventListener("online", () => void flush());
}
