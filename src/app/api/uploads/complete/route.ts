import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { complete } from "@/server/services/upload";
import { completeSchema } from "@/server/validation/upload";
import { enqueueIngest } from "@/server/jobs/enqueue";

export const POST = wrap(async (request) => {
  const ctx = await requireUser();
  const input = completeSchema.parse(await request.json());
  const result = await complete(ctx, input, enqueueIngest);
  return NextResponse.json(result, { status: 202 });
});
