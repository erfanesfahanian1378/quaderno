import { z } from "zod";

/**
 * Environment validation. Fails at boot, loudly, rather than at the first
 * request with a confusing `undefined`.
 *
 * Server-only: this module reads secrets and must never be imported from a
 * client component. The NEXT_PUBLIC_* values are re-exported separately below
 * because Next inlines those at build time.
 */

const bool = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .or(z.boolean());

const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: z.string().url(),
  QUEUE_DATABASE_URL: z.string().url().optional(),

  AUTH_SECRET: z.string().min(32, "Generate one: openssl rand -base64 32"),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),

  S3_ENDPOINT: z.string().url(),
  /*
   * The endpoint the BROWSER is given in a presigned URL.
   *
   * Usually identical to S3_ENDPOINT, and deliberately separate because they
   * are not always the same address. In Docker the server reaches MinIO at
   * http://minio:9000 while the browser must use a published host; on a
   * developer machine the server uses localhost and a phone on the same wifi
   * must use the LAN IP. Handing "localhost" to a phone means the phone tries
   * to upload to itself, the PUT goes nowhere, and the document sits at
   * PENDING for ever.
   *
   * Signed, not rewritten: SigV4 covers the Host header, so a presigned URL
   * has to be GENERATED against the host that will receive it.
   */
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: bool.default(true),

  MAIL_TRANSPORT: z.enum(["console", "smtp"]).default("console"),
  MAIL_FROM: z.string().default("Quaderno <no-reply@quaderno.local>"),
  SMTP_URL: z.string().optional(),

  WORKER_CONVERT_CONCURRENCY: z.coerce.number().int().min(1).default(1),
  WORKER_CONVERT_TIMEOUT_MS: z.coerce.number().int().min(1000).default(120_000),
  STALE_TIMER_MINUTES: z.coerce.number().int().min(1).default(20),

  MAX_UPLOAD_BYTES: z.coerce.number().int().default(157_286_400),

  /*
   * Translation.
   *
   * TRANSLATE_URL points at a self-hosted LibreTranslate and is tried first
   * when set — the only arrangement where the text never leaves the machine.
   * Without it, translation falls back to free public services, which means
   * the highlighted text is sent to a third party. That is a real trade and
   * the setting is how someone opts out of it.
   */
  /*
   * Google sign-in. Optional, and optional TOGETHER — a client id without a
   * secret is a half-configured provider that fails at the redirect rather
   * than at boot, which is the worst place to find out.
   */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  TRANSLATE_URL: z.string().url().optional(),
  TRANSLATE_API_KEY: z.string().optional(),
  LINGVA_URL: z.string().url().default("https://lingva.ml"),

  /*
   * Web Push. All three optional together: without them reminders are simply
   * off, the settings page says so, and nothing else changes. A half-set
   * configuration is the dangerous case, so the service checks all three
   * before it will send anything.
   */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  DEFAULT_STORAGE_QUOTA_BYTES: z.coerce.number().int().default(2_147_483_648),

  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  METRICS_TOKEN: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/**
 * Lazy so that importing a module that touches env does not blow up a build
 * step or a unit test that never actually needs a database.
 */
export function env(): ServerEnv {
  if (cached) return cached;

  /*
   * A blank value means UNSET.
   *
   * `.optional()` accepts `undefined`, not `""` — so `TRANSLATE_URL=""` in an
   * env file is a present value that fails `.url()`, and the whole app refuses
   * to boot over a setting nobody asked for. Env files are full of blank
   * placeholders; treating them as absent is what everyone already assumes,
   * and it is the difference between a deploy that starts and one that
   * crash-loops on a commented-out feature.
   */
  const present: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && value !== "") present[key] = value;
  }

  const parsed = serverSchema.safeParse(present);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment. Copy .env.example to .env and fill in:\n${issues}`,
    );
  }

  cached = parsed.data;
  return cached;
}

/** Test seam — lets a test swap the environment without touching process.env. */
export function __setEnvForTests(value: ServerEnv | null): void {
  cached = value;
}

export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  storageOrigin: process.env.NEXT_PUBLIC_STORAGE_ORIGIN ?? "",
} as const;
