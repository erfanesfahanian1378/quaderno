import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { resetPassword } from "@/server/services/auth";
import { resetPasswordSchema } from "@/server/validation/auth";

export const POST = wrap(async (request) => {
  const { token, password } = resetPasswordSchema.parse(await request.json());
  await resetPassword(token, password);
  return NextResponse.json({ ok: true });
});
