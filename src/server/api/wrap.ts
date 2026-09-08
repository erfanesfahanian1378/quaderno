import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  type ApiError,
  internal,
  isApiError,
  validationFailed,
} from "../errors";
import { requestLogger } from "../logger";

/**
 * The single place an error becomes a response.
 *
 * Route handlers throw typed `ApiError`s (or let a Zod parse throw) and this
 * wrapper maps them to the shape in `docs/API.md`. Handlers must not build
 * error responses by hand — that is how response shapes drift apart.
 */

export type RouteContext = {
  requestId: string;
  log: ReturnType<typeof requestLogger>;
};

export type Handler<TParams = unknown> = (
  request: Request,
  context: RouteContext & { params: TParams },
) => Promise<Response> | Response;

function errorResponse(error: ApiError, requestId: string): NextResponse {
  const headers = new Headers({ "x-request-id": requestId });
  if (error.retryAfter != null) {
    headers.set("Retry-After", String(error.retryAfter));
  }
  return NextResponse.json(error.toJSON(), { status: error.status, headers });
}

/**
 * Wraps a route handler. Usage:
 *
 * ```ts
 * export const GET = wrap(async (request, { log }) => {
 *   const ctx = await requireUser();
 *   return NextResponse.json(await listDocuments(ctx));
 * });
 * ```
 */
export function wrap<TParams = unknown>(handler: Handler<TParams>) {
  /*
   * The context is REQUIRED, not `| undefined`.
   *
   * Next 15 validates every route export against its own `RouteContext`, and
   * a second argument typed `... | undefined` is rejected outright. It builds
   * anyway while `.next/types` holds a stale copy of the generated types,
   * which is how this survived unnoticed until a build into a fresh directory.
   *
   * Next passes a context to every handler, dynamic segments or not — for a
   * static route `params` resolves to an empty object — so requiring it costs
   * nothing at runtime. The optional chaining below stays for direct callers
   * in tests, which pass nothing.
   */
  return async (
    request: Request,
    routeArgs: { params: Promise<TParams> },
  ): Promise<Response> => {
    const requestId =
      request.headers.get("x-request-id") ?? crypto.randomUUID();
    const log = requestLogger(requestId, {
      method: request.method,
      path: new URL(request.url).pathname,
    });

    const startedAt = performance.now();

    try {
      const params = (await routeArgs?.params) as TParams;
      const response = await handler(request, { requestId, log, params });
      response.headers.set("x-request-id", requestId);

      log.debug(
        {
          status: response.status,
          ms: Math.round(performance.now() - startedAt),
        },
        "request completed",
      );
      return response;
    } catch (error) {
      // A Zod failure at the boundary is a client error, not a 500.
      if (error instanceof ZodError) {
        const apiError = validationFailed("Invalid request", {
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
        log.info({ code: apiError.code }, "validation failed");
        return errorResponse(apiError, requestId);
      }

      if (isApiError(error)) {
        // 4xx is the client's problem and is expected traffic; 5xx is ours.
        // The stack is only attached for 5xx — a wrong password is not a bug,
        // and a stack trace per failed login buries the real errors.
        if (error.status >= 500) {
          log.error({ code: error.code, err: error }, error.message);
        } else {
          log.info({ code: error.code, status: error.status }, error.message);
        }
        return errorResponse(error, requestId);
      }

      // Anything unrecognised is a bug. Log it in full, tell the client
      // nothing — an internal message can carry a table name or a file path.
      log.error({ err: error }, "unhandled error in route handler");
      return errorResponse(internal(), requestId);
    }
  };
}
