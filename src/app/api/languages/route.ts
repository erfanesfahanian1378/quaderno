import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import * as service from "@/server/services/language";
import { createLanguageSchema } from "@/server/validation/language";

export const GET = wrap(async () => {
  const ctx = await requireUser();
  return NextResponse.json({ items: await service.list(ctx) });
});

export const POST = wrap(async (request) => {
  const ctx = await requireUser();
  const input = createLanguageSchema.parse(await request.json());
  const language = await service.create(ctx, input);
  return NextResponse.json(language, { status: 201 });
});
