import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as decks from "@/server/repositories/deck";
import * as languages from "@/server/repositories/language";
import { searchParams } from "@/server/api/request";

const createSchema = z.object({
  languageId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).nullable().optional(),
});

export const GET = wrap(async (request) => {
  const ctx = await requireUser();
  const languageId = searchParams(request).get("languageId") ?? undefined;
  return NextResponse.json({ items: await decks.list(ctx, languageId) });
});

export const POST = wrap(async (request) => {
  const ctx = await requireUser();
  const input = createSchema.parse(await request.json());

  // The language id comes from the client; someone else's is not found.
  const language = await languages.findById(ctx, input.languageId);
  if (!language) throw notFound("Language");

  return NextResponse.json(await decks.create(ctx, input), { status: 201 });
});
