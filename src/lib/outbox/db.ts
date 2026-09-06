"use client";

/**
 * The IndexedDB outbox.
 *
 * Step 3 of the five-step write path in ANNOTATION_ENGINE.md §7: every
 * mutation is durably queued **before** it is sent, so a reload, a crash or a
 * dead battery cannot lose a mark the user has already seen appear.
 *
 * Hand-rolled rather than idb/Dexie: this is one object store with four
 * operations, and a wrapper library is 12 KB in the viewer bundle, which has a
 * 250 KB budget (ARCHITECTURE.md §6).
 */

const DB_NAME = "quaderno-outbox";
const DB_VERSION = 1;
const STORE = "ops";

export type OutboxEntry = {
  /** The client-generated UUID; also the idempotency key on the server. */
  clientId: string;
  documentId: string;
  /** The op exactly as it will be POSTed. */
  op: Record<string, unknown>;
  queuedAt: number;
  attempts: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "clientId" });
        store.createIndex("documentId", "documentId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
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

/**
 * Queue an op. Keyed on clientId, so a second edit to the same annotation
 * before the first has flushed REPLACES it rather than queueing twice — which
 * is what keeps a fast drag from sending forty updates.
 */
export async function enqueue(entry: OutboxEntry): Promise<void> {
  await tx("readwrite", (store) => store.put(entry));
}

export async function pending(documentId: string): Promise<OutboxEntry[]> {
  const all = await tx<OutboxEntry[]>(
    "readonly",
    (store) => store.getAll() as IDBRequest<OutboxEntry[]>,
  );
  return all
    .filter((entry) => entry.documentId === documentId)
    .sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function remove(clientIds: string[]): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    for (const clientId of clientIds) store.delete(clientId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function bumpAttempts(clientIds: string[]): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);

    for (const clientId of clientIds) {
      const get = store.get(clientId);
      get.onsuccess = () => {
        const entry = get.result as OutboxEntry | undefined;
        if (entry) store.put({ ...entry, attempts: entry.attempts + 1 });
      };
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function count(documentId: string): Promise<number> {
  return (await pending(documentId)).length;
}

/** True when IndexedDB is usable — private mode and some browsers block it. */
export function isAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}
