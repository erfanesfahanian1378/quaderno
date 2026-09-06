import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import * as search from "@/server/repositories/search";
import { searchParams } from "@/server/api/request";

export const GET = wrap(async (request) => {
  const ctx = await requireUser();
  const params = searchParams(request);

  const items = await search.search(
    ctx,
    params.get("q") ?? "",
    params.get("languageId") ?? undefined,
  );

  return NextResponse.json({ items });
});
