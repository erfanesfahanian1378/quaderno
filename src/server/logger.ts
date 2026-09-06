import pino, { type Logger } from "pino";
import { env } from "./env";

/**
 * Structured JSON logs to stdout, rotated by the platform. That is the whole
 * observability story on a €5 box (ARCHITECTURE.md §8) and it is enough.
 *
 * The redaction list is not optional. PHASE-09 §3 requires that secrets never
 * reach a log line, and the cheapest way to guarantee it is to redact by path
 * here rather than to audit every call site.
 */
const REDACT = [
  "password",
  "passwordHash",
  "token",
  "sessionToken",
  "secret",
  "authorization",
  "cookie",
  "*.password",
  "*.passwordHash",
  "*.token",
  "*.secret",
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
  "env.AUTH_SECRET",
  "env.S3_SECRET_ACCESS_KEY",
  "env.SMTP_URL",
  "env.METRICS_TOKEN",
];

function create(): Logger {
  const level = process.env.LOG_LEVEL ?? "info";
  const isDev = process.env.NODE_ENV !== "production";

  return pino({
    level,
    redact: { paths: REDACT, censor: "[redacted]" },
    base: { service: "quaderno" },
    timestamp: pino.stdTimeFunctions.isoTime,
    // pino-pretty is a devDependency; never reach for it in production.
    ...(isDev && process.env.VITEST !== "true"
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss.l" },
          },
        }
      : {}),
  });
}

export const logger: Logger = create();

/**
 * A child logger carrying the request id. Every route handler gets one from
 * the wrapper in `src/server/api/wrap.ts`, so a single request's lines can be
 * grepped out of a busy log.
 */
export function requestLogger(requestId: string, extra: object = {}): Logger {
  return logger.child({ requestId, ...extra });
}

/** Re-exported so nothing else needs to depend on pino's types directly. */
export type { Logger };

/** Guard so a config accident cannot silently disable structured logging. */
export function assertLoggerConfigured(): void {
  if (!env().LOG_LEVEL) throw new Error("LOG_LEVEL is not configured");
}
