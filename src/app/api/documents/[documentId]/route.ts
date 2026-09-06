import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as documents from "@/server/repositories/document";

type Params = { documentId: string };

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  starred: z.boolean().optional(),
  courseId: z.string().min(1).nullable().optional(),
  classSessionId: z.string().min(1).nullable().optional(),
});

export const GET = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();
  const full = await documents.findFull(ctx, params.documentId);
  if (!full) throw notFound("Document");

  return NextResponse.json({
    ...full,
    sourceFiles: full.sourceFiles.map((file) => ({
      ...file,
      byteSize: file.byteSize.toString(),
    })),
    leaves: full.leaves.map((leaf) => ({
      ...leaf,
      position: String(leaf.position),
    })),
  });
});

export const PATCH = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const input = patchSchema.parse(await request.json());
  const updated = await documents.update(ctx, params.documentId, input);
  if (!updated) throw notFound("Document");
  return NextResponse.json(updated);
});

export const DELETE = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();
  // Soft delete — 30-day trash. Users delete class notes by accident.
  if (!(await documents.softDelete(ctx, params.documentId))) {
    throw notFound("Document");
  }
  return new NextResponse(null, { status: 204 });
});
