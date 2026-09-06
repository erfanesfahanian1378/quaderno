/**
 * The repository convention. PHASE-02 builds the real thing on top of this;
 * Phase 01 establishes the shape so nothing later invents its own.
 *
 * CLAUDE.md hard rule #2: **every repository function takes
 * `ctx: { userId }` as its first argument and injects `userId` into the
 * `where` clause itself.** Never trust a caller to scope a query.
 *
 * The reason is IDOR (ARCHITECTURE.md §7). Documents are just ids. If scoping
 * is the caller's job, one forgotten `where` in one route handler leaks
 * another user's notes. Putting it in the repository makes the safe thing the
 * only thing you can write.
 */

export type Ctx = {
  readonly userId: string;
};

/**
 * Builds a `where` clause that always carries the tenant scope. Repository
 * functions compose their own filters through this rather than writing
 * `{ userId: ctx.userId, ... }` by hand — one place to get right, and a
 * spread that cannot accidentally be overwritten because `userId` is applied
 * last.
 */
export function scoped<T extends object>(
  ctx: Ctx,
  where: T,
): T & { userId: string } {
  return { ...where, userId: ctx.userId };
}

/**
 * Cursor pagination. CLAUDE.md rule #9: cursor only, no OFFSET, no unbounded
 * list query. OFFSET degrades linearly with depth and this app has users who
 * will scroll a year of class sessions.
 */
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export type CursorPage = {
  limit?: number | undefined;
  cursor?: string | undefined;
};

export type Paginated<T> = {
  items: T[];
  nextCursor: string | null;
};

export function pageSize(limit: number | undefined): number {
  if (limit == null) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(1, Math.trunc(limit)), MAX_PAGE_SIZE);
}

/**
 * Prisma's cursor pagination: take one extra row, and if it came back there
 * is another page. `cursor` is the id of the last row of the previous page.
 */
export function cursorArgs(page: CursorPage) {
  const take = pageSize(page.limit);
  return {
    take: take + 1,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
  };
}

export function toPage<T extends { id: string }>(
  rows: T[],
  page: CursorPage,
): Paginated<T> {
  const take = pageSize(page.limit);
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return {
    items,
    nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
  };
}
