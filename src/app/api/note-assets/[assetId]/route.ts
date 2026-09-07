import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as noteAssets from "@/server/repositories/note-asset";
import * as users from "@/server/repositories/user";
import { deleteObject } from "@/server/storage";

type Params = { assetId: string };

export const DELETE = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();

  const asset = await noteAssets.remove(ctx, params.assetId);
  if (!asset) throw notFound("Recording");

  // Give the space back, then remove the object. In that order: a failed
  // delete leaves an orphan object, which a sweep can find; a failed decrement
  // leaves the user permanently over quota, which nothing can.
  await users.addStorageUsed(ctx, -BigInt(asset.byteSize));
  await deleteObject(asset.storageKey).catch(() => undefined);

  return NextResponse.json({ deleted: true });
});
