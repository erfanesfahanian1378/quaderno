/**
 * Integration tests talk to the real Postgres and MinIO from
 * `docker compose --profile dev up -d`. They are skipped rather than failed
 * when those are not reachable, so a contributor without Docker running still
 * gets a green unit run and an honest message instead of a wall of red.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const INTEGRATION_ENV_DEFAULTS: Record<string, string> = {
  DATABASE_URL:
    "postgresql://quaderno:quaderno@localhost:5432/quaderno?schema=public&connection_limit=8",
  QUEUE_DATABASE_URL:
    "postgresql://quaderno:quaderno@localhost:5432/quaderno?schema=pgboss",
  AUTH_SECRET: "test-secret-test-secret-test-secret-32",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "quaderno",
  S3_ACCESS_KEY_ID: "quaderno",
  S3_SECRET_ACCESS_KEY: "quaderno-dev-secret",
  S3_FORCE_PATH_STYLE: "true",
  LOG_LEVEL: "error",
};

/**
 * Reads `.env` if there is one.
 *
 * Vitest does not get Node's `--env-file`, and the defaults below assume a
 * clean machine on the standard ports. A developer whose machine already runs
 * Postgres has DB_PORT set in `.env` — without reading it, every integration
 * test silently skips against the wrong port and the suite looks green while
 * testing nothing.
 */
function loadDotEnv(): void {
  try {
    const path = join(process.cwd(), ".env");
    if (!existsSync(path)) return;

    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;

      const [, key, rest = ""] = match;
      if (!key || process.env[key] !== undefined) continue;

      process.env[key] = parseValue(rest);
    }
  } catch {
    // No .env, or unreadable: fall through to the defaults.
  }
}

/**
 * A quoted value ends at its closing quote; an unquoted one ends at the first
 * comment marker. Getting this wrong swallows the trailing `# comment` into
 * the value, which is how `LOG_LEVEL` once became
 * `debug   # trace|debug|info|...` and made pino throw at import time.
 */
function parseValue(raw: string): string {
  const trimmed = raw.trim();

  const quote = trimmed[0];
  if (quote === '"' || quote === "'") {
    const end = trimmed.indexOf(quote, 1);
    return end > 0 ? trimmed.slice(1, end) : trimmed.slice(1);
  }

  const comment = trimmed.indexOf("#");
  return (comment >= 0 ? trimmed.slice(0, comment) : trimmed).trim();
}

/**
 * Called from an integration test's own `beforeAll`. Not a global setup file:
 * a unit run must never inherit a DATABASE_URL it might accidentally use.
 */
export function applyIntegrationEnv(): void {
  loadDotEnv();
  for (const [key, value] of Object.entries(INTEGRATION_ENV_DEFAULTS)) {
    process.env[key] ??= value;
  }
}

/** True when the S3 endpoint answers. Used to skip rather than fail. */
export async function storageReachable(): Promise<boolean> {
  const endpoint = process.env.S3_ENDPOINT ?? "";
  if (!endpoint) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    // MinIO answers this without credentials.
    const response = await fetch(`${endpoint}/minio/health/live`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

export async function databaseReachable(): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$disconnect();
    return true;
  } catch {
    return false;
  }
}
