import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { searchParams } from "@/server/api/request";
import { validationFailed } from "@/server/errors";
import * as folders from "@/server/repositories/folder";
import { createFolder } from "@/server/services/library/folders";

const createSchema = z.object({
  languageId: z.string().min(1),
  parentId: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(80),
});

export const GET = wrap(async (request) => {
  const ctx = await requireUser();
  const languageId = searchParams(request).get("languageId");
  if (!languageId) throw validationFailed("languageId is required");

  return NextResponse.json({
    items: await folders.listForLanguage(ctx, languageId),
  });
});

export const POST = wrap(async (request) => {
  const ctx = await requireUser();
  const input = createSchema.parse(await request.json());

  const folder = await createFolder(ctx, {
    languageId: input.languageId,
    parentId: input.parentId ?? null,
    name: input.name,
  });

  return NextResponse.json(folder, { status: 201 });
});
