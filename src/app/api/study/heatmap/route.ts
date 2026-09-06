import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import * as study from "@/server/services/study";
import { searchParams } from "@/server/api/request";

/**
 * One query, ≤365 rows per language, straight from StudyDayAggregate — never
 * a scan over sessions (DATA_MODEL.md §7).
 */
export const GET = wrap(async (request) => {
  const ctx = await requireUser();
  const languageId = searchParams(request).get("languageId") ?? undefined;
  return NextResponse.json({ items: await study.heatmap(ctx, languageId) });
});
