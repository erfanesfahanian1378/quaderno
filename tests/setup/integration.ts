/**
 * Integration tests talk to the real Postgres and MinIO from
 * `docker compose --profile dev up -d`. They are skipped rather than failed
 * when those are not reachable, so a contributor without Docker running still
 * gets a green unit run and an honest message instead of a wall of red.
 */
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
 * Called from an integration test's own `beforeAll`. Not a global setup file:
 * a unit run must never inherit a DATABASE_URL it might accidentally use.
 */
export function applyIntegrationEnv(): void {
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
