/**
 * Browser-side API client.
 *
 * Exists so that every form handles failure the same way. The important case
 * is the one that is easy to forget: `fetch` REJECTS on a network failure
 * rather than resolving with a non-ok response, so a handler that only checks
 * `response.ok` leaves the form spinning forever when the user goes through a
 * tunnel — which, for this app, is a normal Tuesday.
 */

import type { ErrorCode } from "@/server/errors";

export type ApiFailure = {
  code: ErrorCode | "NETWORK";
  message: string;
  details?: Record<string, unknown>;
  retryAfter?: number;
};

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; error: ApiFailure };

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  /** Extra headers — the write queue sends an `Idempotency-Key`. */
  headers?: Record<string, string>,
): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    return {
      ok: false,
      error: {
        code: "NETWORK",
        message: "No connection. Your changes are safe — try again.",
      },
    };
  }

  if (response.status === 204) {
    return { ok: true, data: undefined as T };
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: {
          code?: ErrorCode;
          message?: string;
          details?: Record<string, unknown>;
        };
      }
    | T
    | null;

  if (!response.ok) {
    const wrapped = payload as {
      error?: {
        code?: ErrorCode;
        message?: string;
        details?: Record<string, unknown>;
      };
    } | null;

    const retryAfter = response.headers.get("Retry-After");

    return {
      ok: false,
      error: {
        code: wrapped?.error?.code ?? "INTERNAL",
        message: wrapped?.error?.message ?? "Something went wrong.",
        ...(wrapped?.error?.details ? { details: wrapped.error.details } : {}),
        ...(retryAfter ? { retryAfter: Number(retryAfter) } : {}),
      },
    };
  }

  return { ok: true, data: payload as T };
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>("POST", path, body, headers),
  put: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>("PUT", path, body, headers),
  patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>("PATCH", path, body, headers),
  delete: <T>(path: string) => request<T>("DELETE", path),

  /**
   * The generic form, for the write queue — which replays a stored method and
   * path it does not know at compile time, with an idempotency header.
   */
  request: <T>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ) => request<T>(method, path, body, headers),
};

/**
 * Wraps an async event handler for use in JSX.
 *
 * `onSubmit={handler}` where handler is async is a lint error for a good
 * reason: the returned promise is dropped, so a throw inside it becomes an
 * unhandled rejection that no one sees. This makes the drop explicit and
 * routes the failure somewhere.
 */
export function handler<E>(
  fn: (event: E) => Promise<void>,
  onError?: (error: unknown) => void,
): (event: E) => void {
  return (event: E) => {
    fn(event).catch((error: unknown) => {
      if (onError) onError(error);
      else console.error(error);
    });
  };
}
