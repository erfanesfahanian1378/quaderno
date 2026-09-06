import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import * as repo from "@/server/repositories/class-session";
import { createClassSessionSchema } from "@/server/validation/language";
import { pageParams, searchParams } from "@/server/api/request";

export const GET = wrap(async (request) => {
  const ctx = await requireUser();
  const params = searchParams(request);
  const from = params.get("from");
  const to = params.get("to");

  const page = await repo.list(
    ctx,
    {
      languageId: params.get("languageId") ?? undefined,
      courseId: params.get("courseId") ?? undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    },
    pageParams(request),
  );
  return NextResponse.json(page);
});

export const POST = wrap(async (request) => {
  const ctx = await requireUser();
  const input = createClassSessionSchema.parse(await request.json());
  const created = await repo.create(ctx, input);
  return NextResponse.json(created, { status: 201 });
});
