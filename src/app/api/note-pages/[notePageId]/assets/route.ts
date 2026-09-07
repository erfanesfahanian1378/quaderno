import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound, quotaExceeded, validationFailed } from "@/server/errors";
import * as notePages from "@/server/repositories/note-page";
import * as noteAssets from "@/server/repositories/note-asset";
import * as users from "@/server/repositories/user";
import { getSignedReadUrl, getSignedUploadUrl } from "@/server/storage";
import { noteAssetKey } from "@/server/storage/keys";
import { uuid } from "@/lib/uuid";

type Params = { notePageId: string };

/**
 * Recorded audio only, and a short cap.
 *
 * The feature is "say the word, then hear the reference voice and compare" —
 * that is seconds of speech, not a lecture. A tight cap keeps a slip of the
 * finger from eating someone's quota, and the formats are the two that
 * MediaRecorder actually produces: webm/opus everywhere, mp4/aac on iOS.
 */
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

const ALLOWED = [
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/aac",
];

const postSchema = z.object({
  mimeType: z.string().max(80),
  byteSize: z.number().int().positive(),
  durationMs: z.number().int().min(0).max(600_000).optional(),
  label: z.string().max(120).optional(),
});

export const GET = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();

  const page = await notePages.findById(ctx, params.notePageId);
  if (!page) throw notFound("Note page");

  const assets = await noteAssets.forNotePage(ctx, params.notePageId);

  return NextResponse.json({
    assets: await Promise.all(
      assets.map(async (asset) => ({
        id: asset.id,
        mimeType: asset.mimeType,
        durationMs: asset.durationMs,
        label: asset.label,
        createdAt: asset.createdAt,
        url: (await getSignedReadUrl(ctx.userId, asset.storageKey)).url,
      })),
    ),
  });
});

/**
 * Presign a PUT and record the row.
 *
 * The row is written before the bytes land, matching the document upload
 * path: an asset whose object never arrived shows as a clip that will not
 * play, which is recoverable. The reverse — bytes with no row — is a leak
 * nothing will ever clean up.
 */
export const POST = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const input = postSchema.parse(await request.json());

  const base = input.mimeType.split(";")[0]?.trim() ?? "";
  if (!ALLOWED.includes(input.mimeType) && !ALLOWED.includes(base)) {
    throw validationFailed("That is not an audio format we can store.", {
      field: "mimeType",
    });
  }
  if (input.byteSize > MAX_AUDIO_BYTES) {
    throw validationFailed(
      `That recording is longer than the ${MAX_AUDIO_BYTES / 1024 / 1024} MB limit.`,
      { field: "byteSize" },
    );
  }

  const page = await notePages.findById(ctx, params.notePageId);
  if (!page) throw notFound("Note page");

  const context = await notePages.contextOf(ctx, params.notePageId);
  if (!context) throw notFound("Note page");

  // Checked before the URL is handed out, not after the bytes are stored.
  const user = await users.findById(ctx);
  if (!user) throw notFound("Account");
  if (user.storageUsedBytes + BigInt(input.byteSize) > user.storageQuotaBytes) {
    throw quotaExceeded(
      "That would take you past your storage limit. Delete something first.",
    );
  }

  const key = noteAssetKey(ctx.userId, context.documentId, uuid(), base);

  const asset = await noteAssets.create(ctx, {
    notePageId: params.notePageId,
    documentId: context.documentId,
    storageKey: key,
    mimeType: base,
    byteSize: input.byteSize,
    durationMs: input.durationMs ?? null,
    label: input.label ?? null,
  });

  await users.addStorageUsed(ctx, BigInt(input.byteSize));

  const upload = await getSignedUploadUrl(ctx.userId, key, {
    contentType: base,
    contentLength: input.byteSize,
  });

  return NextResponse.json(
    { asset: { id: asset.id }, upload },
    { status: 201 },
  );
});
