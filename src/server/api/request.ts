/**
 * Request helpers.
 *
 * `clientIp` reads the proxy headers Caddy sets. It is used for rate limiting
 * only — never for authorisation, because a header is client-controlled the
 * moment your proxy configuration is wrong.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "0.0.0.0";
}

export function searchParams(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

/** Cursor pagination inputs, parsed once, the same way, everywhere. */
export function pageParams(request: Request): {
  limit: number | undefined;
  cursor: string | undefined;
} {
  const params = searchParams(request);
  const rawLimit = params.get("limit");
  return {
    limit: rawLimit ? Number(rawLimit) : undefined,
    cursor: params.get("cursor") ?? undefined,
  };
}
