import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import * as service from "@/server/services/language";
import { updateLanguageSchema } from "@/server/validation/language";
import { searchParams } from "@/server/api/request";

type Params = { languageId: string };

export const GET = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();
  return NextResponse.json(await service.get(ctx, params.languageId));
});

export const PATCH = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const input = updateLanguageSchema.parse(await request.json());
  return NextResponse.json(await service.update(ctx, params.languageId, input));
});

export const DELETE = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  // `?hard=true` requires the language be empty; the default is to archive.
  if (searchParams(request).get("hard") === "true") {
    await service.remove(ctx, params.languageId);
  } else {
    await service.archive(ctx, params.languageId);
  }
  return new NextResponse(null, { status: 204 });
});
