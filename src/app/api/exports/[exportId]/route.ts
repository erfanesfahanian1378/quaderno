import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as exports from "@/server/repositories/export";
import { getSignedReadUrl } from "@/server/storage";

type Params = { exportId: string };

export const GET = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();

  const record = await exports.findById(ctx, params.exportId);
  if (!record) throw notFound("Export");

  const downloadUrl =
    record.status === "READY" && record.storageKey
      ? (await getSignedReadUrl(ctx.userId, record.storageKey)).url
      : null;

  return NextResponse.json({
    status: record.status,
    error: record.error,
    ...(downloadUrl ? { downloadUrl } : {}),
  });
});
