import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as users from "@/server/repositories/user";
import * as languages from "@/server/repositories/language";
import { THEMES } from "@/lib/theme";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  locale: z.string().trim().min(2).max(10).optional(),
  timeZone: z.string().trim().min(1).max(64).optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
  theme: z.enum(THEMES).optional(),

  /*
   * Reminders. Null is a real value here — it means "off" — so both are
   * nullable rather than merely optional, and `undefined` still means "leave
   * this alone".
   */
  notifyClassMinutes: z.number().int().min(1).max(180).nullable().optional(),
  notifyStudyAt: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM")
    .nullable()
    .optional(),
});

export const GET = wrap(async () => {
  const ctx = await requireUser();
  const user = await users.findById(ctx);
  if (!user) throw notFound("Account");

  return NextResponse.json({
    user: {
      ...user,
      // BigInt does not survive JSON.stringify.
      storageQuotaBytes: user.storageQuotaBytes.toString(),
      storageUsedBytes: user.storageUsedBytes.toString(),
    },
    languages: await languages.list(ctx),
  });
});

export const PATCH = wrap(async (request) => {
  const ctx = await requireUser();
  const input = patchSchema.parse(await request.json());
  const updated = await users.update(ctx, input);
  if (!updated) throw notFound("Account");
  return NextResponse.json({
    ...updated,
    storageQuotaBytes: updated.storageQuotaBytes.toString(),
    storageUsedBytes: updated.storageUsedBytes.toString(),
  });
});
