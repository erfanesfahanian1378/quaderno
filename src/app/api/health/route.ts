import { NextResponse } from "next/server";
import { checkHealth } from "@/server/repositories/health";

/**
 * The container healthcheck target. ARCHITECTURE.md §8.
 *
 * The only endpoint under /api without auth, deliberately — a healthcheck that
 * needs a session cannot tell a load balancer anything useful. It therefore
 * reports liveness, never data: counts and booleans, no user content.
 */
export async function GET() {
  const health = await checkHealth();
  const ok = health.db && health.storage;

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      ...health,
      version: process.env.npm_package_version ?? "0.1.0",
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
