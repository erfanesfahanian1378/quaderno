/**
 * The error vocabulary. `docs/API.md` defines the wire shape; this file is its
 * only implementation.
 *
 * Rule that matters more than the rest: a record owned by another user returns
 * **404, never 403**. Existence is information, and documents are just ids —
 * IDOR is the top risk in this app (ARCHITECTURE.md §7). `notFound()` below is
 * the sanctioned way to reject both "does not exist" and "is not yours", and
 * they are deliberately indistinguishable.
 */

export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "CONFLICT",
  "QUOTA_EXCEEDED",
  "UNSUPPORTED_MEDIA_TYPE",
  "RATE_LIMITED",
  "CONVERSION_FAILED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  QUOTA_EXCEEDED: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  CONVERSION_FAILED: 422,
  INTERNAL: 500,
};

export type ErrorDetails = Record<string, unknown>;

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ErrorDetails | undefined;
  /** Sent as `Retry-After` when present. Seconds. */
  readonly retryAfter: number | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      details?: ErrorDetails;
      retryAfter?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = options.details;
    this.retryAfter = options.retryAfter;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

// ---------------------------------------------------------------------------
// Constructors. Prefer these over `new ApiError` so the messages stay uniform.
// ---------------------------------------------------------------------------

export const unauthenticated = (message = "Sign in to continue") =>
  new ApiError("UNAUTHENTICATED", message);

/**
 * Use for "this account may not do this", never for "this row belongs to
 * someone else" — that is `notFound()`.
 */
export const forbidden = (message = "Not allowed") =>
  new ApiError("FORBIDDEN", message);

/**
 * The response for a missing record AND for another user's record. Do not add
 * a 403 branch for ownership; that branch is an information leak.
 */
export const notFound = (what = "Resource") =>
  new ApiError("NOT_FOUND", `${what} not found`);

export const validationFailed = (
  message = "Invalid request",
  details?: ErrorDetails,
) => new ApiError("VALIDATION_FAILED", message, { details });

export const conflict = (message: string, details?: ErrorDetails) =>
  new ApiError("CONFLICT", message, { details });

export const quotaExceeded = (message = "Storage quota exceeded") =>
  new ApiError("QUOTA_EXCEEDED", message);

export const unsupportedMediaType = (message = "Unsupported file type") =>
  new ApiError("UNSUPPORTED_MEDIA_TYPE", message);

export const rateLimited = (
  retryAfter: number,
  message = "Too many requests",
) => new ApiError("RATE_LIMITED", message, { retryAfter });

export const conversionFailed = (message: string, details?: ErrorDetails) =>
  new ApiError("CONVERSION_FAILED", message, { details });

export const internal = (message = "Something went wrong", cause?: unknown) =>
  new ApiError("INTERNAL", message, { cause });
