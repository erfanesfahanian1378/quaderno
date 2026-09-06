import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import * as study from "@/server/services/study";
import * as repo from "@/server/repositories/study";
import { pageParams, searchParams } from "@/server/api/request";

const schema = z.object({
  languageId: z.string().min(1),
  activity: z.enum([
    "CLASS",
    "HOMEWORK",
    "READING",
    "REVIEW",
    "LISTENING",
    "SPEAKING",
    "WRITING",
    "OTHER",
  ]),
  startedAt: z.coerce.date(),
  durationSec: z
    .number()
    .int()
    .positive()
    .max(24 * 3600),
  note: z.string().trim().max(500).optional(),
  documentId: z.string().min(1).optional(),
  classSessionId: z.string().min(1).optional(),
});

export const GET = wrap(async (request) => {
  const ctx = await requireUser();
  const params = searchParams(request);
  const from = params.get("from");
  const to = params.get("to");

  return NextResponse.json(
    await repo.listSessions(
      ctx,
      {
        languageId: params.get("languageId") ?? undefined,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      },
      pageParams(request),
    ),
  );
});

/** Manual log — the studying done away from the screen. */
export const POST = wrap(async (request) => {
  const ctx = await requireUser();
  const input = schema.parse(await request.json());
  return NextResponse.json(await study.logManual(ctx, input), { status: 201 });
});
