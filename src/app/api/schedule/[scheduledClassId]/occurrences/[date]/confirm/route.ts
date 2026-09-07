import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { validationFailed } from "@/server/errors";
import { confirm } from "@/server/services/study/schedule";
import { confirmSchema } from "@/server/validation/schedule";

type Params = { scheduledClassId: string; date: string };

/**
 * "Did you attend?" — the answer that makes the hours log themselves.
 * Idempotent: repeating it creates nothing new.
 */
export const POST = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    throw validationFailed("Expected a YYYY-MM-DD date");
  }

  const body = await request.json().catch(() => ({ attended: true }));
  const { attended } = confirmSchema.parse(body);

  return NextResponse.json(
    await confirm(ctx, params.scheduledClassId, params.date, attended),
  );
});
