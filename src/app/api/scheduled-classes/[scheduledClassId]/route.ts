import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as repo from "@/server/repositories/scheduled-class";
import { updateScheduledClassSchema } from "@/server/validation/schedule";

type Params = { scheduledClassId: string };

export const PATCH = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const input = updateScheduledClassSchema.parse(await request.json());
  const updated = await repo.update(ctx, params.scheduledClassId, input);
  if (!updated) throw notFound("Scheduled class");
  return NextResponse.json(updated);
});

/** Deactivates. Confirmed classes and their logged hours must survive. */
export const DELETE = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();
  if (!(await repo.deactivate(ctx, params.scheduledClassId))) {
    throw notFound("Scheduled class");
  }
  return new NextResponse(null, { status: 204 });
});
