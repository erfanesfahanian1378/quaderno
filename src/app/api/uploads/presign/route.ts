import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { presign } from "@/server/services/upload";
import { presignSchema } from "@/server/validation/upload";

export const POST = wrap(async (request) => {
  const ctx = await requireUser();
  const input = presignSchema.parse(await request.json());
  return NextResponse.json(await presign(ctx, input), { status: 201 });
});
