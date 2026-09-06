import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requestPasswordReset } from "@/server/services/auth";
import { forgotPasswordSchema } from "@/server/validation/auth";
import { clientIp } from "@/server/api/request";

/**
 * Always 202, whether or not the address exists — and in the same time.
 * Anything else is an account-enumeration oracle.
 */
export const POST = wrap(async (request) => {
  const { email } = forgotPasswordSchema.parse(await request.json());
  await requestPasswordReset(email, { ip: clientIp(request) });
  return NextResponse.json({ ok: true }, { status: 202 });
});
