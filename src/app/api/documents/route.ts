import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import * as documents from "@/server/repositories/document";
import { pageParams, searchParams } from "@/server/api/request";
import { createNativeDocument } from "@/server/services/composition";
import { z } from "zod";

const createSchema = z.object({
  languageId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  courseId: z.string().min(1).optional(),
  classSessionId: z.string().min(1).optional(),
  template: z
    .enum(["blank", "lined", "grid", "cornell", "vocabulary", "conjugation"])
    .optional(),
});

export const GET = wrap(async (request) => {
  const ctx = await requireUser();
  const params = searchParams(request);

  const page = await documents.list(
    ctx,
    {
      languageId: params.get("languageId") ?? undefined,
      courseId: params.get("courseId") ?? undefined,
      classSessionId: params.get("classSessionId") ?? undefined,
      tag: params.get("tag") ?? undefined,
      starred: params.get("starred") === "true" ? true : undefined,
      query: params.get("q") ?? undefined,
    },
    pageParams(request),
    (params.get("sort") as "recent" | "title" | "created") ?? "recent",
  );

  return NextResponse.json(page);
});

/** Creates a NATIVE document — a note-only document, same viewer, same layer. */
export const POST = wrap(async (request) => {
  const ctx = await requireUser();
  const input = createSchema.parse(await request.json());
  const created = await createNativeDocument(ctx, input);
  return NextResponse.json(created, { status: 201 });
});
