import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { conflict } from "@/server/errors";
import {
  pushConfigured,
  sendToUser,
} from "@/server/services/notifications/push";

/**
 * Send one to yourself, now.
 *
 * Notification permission is the most confusing thing on the web platform:
 * it can be granted in the page but muted by the operating system, or allowed
 * on a laptop and silently denied in a phone's focus mode. A button that
 * proves delivery end to end is worth more than any amount of explanation.
 */
export const POST = wrap(async () => {
  const ctx = await requireUser();

  if (!pushConfigured()) {
    throw conflict(
      "Reminders are not configured on this server — the VAPID keys are missing.",
    );
  }

  const result = await sendToUser(ctx.userId, {
    title: "Reminders are working",
    body: "This is what a class reminder will look like.",
    url: "/settings",
    tag: "test",
  });

  if (result.sent === 0) {
    throw conflict(
      "Nothing was delivered. The browser may have revoked permission — turn reminders off and on again.",
    );
  }

  return NextResponse.json(result);
});
