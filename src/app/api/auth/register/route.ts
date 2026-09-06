import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { register } from "@/server/services/auth";
import { registerSchema } from "@/server/validation/auth";
import { clientIp } from "@/server/api/request";

export const POST = wrap(async (request) => {
  const input = registerSchema.parse(await request.json());
  const result = await register(input, { ip: clientIp(request) });
  return NextResponse.json(result, { status: 201 });
});
