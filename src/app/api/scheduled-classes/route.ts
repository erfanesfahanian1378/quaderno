import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import * as repo from "@/server/repositories/scheduled-class";
import { create } from "@/server/services/study/schedule";
import { createScheduledClassSchema } from "@/server/validation/schedule";

export const GET = wrap(async () => {
  const ctx = await requireUser();
  return NextResponse.json({ items: await repo.listAll(ctx) });
});

export const POST = wrap(async (request) => {
  const ctx = await requireUser();
  const input = createScheduledClassSchema.parse(await request.json());
  return NextResponse.json(await create(ctx, input), { status: 201 });
});
