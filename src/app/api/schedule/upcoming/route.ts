import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { upcoming } from "@/server/services/study/schedule";
import { searchParams } from "@/server/api/request";

/**
 * Expands the rules and merges materialised `ClassSession` rows over the
 * generated occurrences, so a confirmed class is never shown twice.
 */
export const GET = wrap(async (request) => {
  const ctx = await requireUser();
  const days = Number(searchParams(request).get("days") ?? 14);
  return NextResponse.json({ items: await upcoming(ctx, days) });
});
