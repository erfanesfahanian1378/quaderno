import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as repo from "@/server/repositories/class-session";
import { updateClassSessionSchema } from "@/server/validation/language";

type Params = { classSessionId: string };

export const PATCH = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const input = updateClassSessionSchema.parse(await request.json());
  const updated = await repo.update(ctx, params.classSessionId, input);
  if (!updated) throw notFound("Class");
  return NextResponse.json(updated);
});

export const DELETE = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();
  if (!(await repo.remove(ctx, params.classSessionId))) throw notFound("Class");
  return new NextResponse(null, { status: 204 });
});
