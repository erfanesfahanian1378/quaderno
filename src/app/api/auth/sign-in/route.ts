import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { signInSchema } from "@/server/validation/auth";
import { clientIp } from "@/server/api/request";
import { signInWithPassword } from "@/server/services/auth";

export const POST = wrap(async (request) => {
  const input = signInSchema.parse(await request.json());
  const result = await signInWithPassword(input, { ip: clientIp(request) });
  return NextResponse.json(result);
});
