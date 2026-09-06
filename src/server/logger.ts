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

  /*
   * No pino-pretty transport here, deliberately.
   *
   * pino's transports run in a worker thread, and Next bundles the server in a
   * way that tears that worker down — every log line then throws
   * "the worker has exited" from inside the route wrapper, which turns a
   * logged 4xx into a crashed request. Losing colour in the terminal is a fair
   * trade for logging that cannot take down a handler.
   *
   * For readable local logs, pipe instead:  pnpm dev | pnpm exec pino-pretty
   * The worker process (worker/index.ts) is a plain Node process and does use
   * the transport.
   */
  return pino({
    level,
    redact: { paths: REDACT, censor: "[redacted]" },
    base: { service: "quaderno" },
    timestamp: pino.stdTimeFunctions.isoTime,
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
