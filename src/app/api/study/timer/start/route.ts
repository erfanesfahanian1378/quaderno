import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import * as study from "@/server/services/study";

const schema = z.object({
  languageId: z.string().min(1),
  activity: z
    .enum([
      "CLASS",
      "HOMEWORK",
      "READING",
      "REVIEW",
      "LISTENING",
      "SPEAKING",
      "WRITING",
      "OTHER",
    ])
    .optional(),
  documentId: z.string().min(1).optional(),
  classSessionId: z.string().min(1).optional(),
});

/** 409 when a timer is already running — API.md, and the DB index agrees. */
export const POST = wrap(async (request) => {
  const ctx = await requireUser();
  const input = schema.parse(await request.json());
  return NextResponse.json(await study.startTimer(ctx, input), { status: 201 });
});
