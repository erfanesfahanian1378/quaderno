import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import * as subscriptions from "@/server/repositories/push-subscription";
import { searchParams } from "@/server/api/request";
import { validationFailed } from "@/server/errors";

const bodySchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(400),
    auth: z.string().min(1).max(400),
  }),
});

/** Register this browser for reminders. */
export const POST = wrap(async (request) => {
  const ctx = await requireUser();
  const input = bodySchema.parse(await request.json());

  await subscriptions.upsert(ctx, {
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    // Only so the settings list can say which browser is which.
    userAgent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
  });

  return NextResponse.json({ subscribed: true }, { status: 201 });
});

/**
 * Unregister it. Idempotent: unsubscribing twice is not an error.
 *
 * The endpoint arrives as a query parameter rather than a body — a DELETE
 * with a body is allowed but poorly supported by intermediaries, and the
 * client's `delete` sends none.
 */
export const DELETE = wrap(async (request) => {
  const ctx = await requireUser();

  const endpoint = searchParams(request).get("endpoint");
  if (!endpoint) throw validationFailed("endpoint is required");

  await subscriptions.remove(ctx, endpoint);
  return NextResponse.json({ subscribed: false });
});
