import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { establishSession, register } from "@/server/services/auth";
import { registerSchema } from "@/server/validation/auth";
import { clientIp } from "@/server/api/request";

export const POST = wrap(async (request) => {
  const input = registerSchema.parse(await request.json());
  const result = await register(input, { ip: clientIp(request) });

  // Sign them in immediately. Making someone check their inbox before they can
  // try the app is how you lose them at the door; verification is a reminder,
  // not a gate.
  await establishSession(result.userId);

  return NextResponse.json(result, { status: 201 });
});
