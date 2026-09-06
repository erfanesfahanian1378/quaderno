import { spawn } from "node:child_process";

/**
 * Bounded subprocess execution.
 *
 * Everything the worker shells out to (LibreOffice, qpdf, ocrmypdf) is treated
 * as hostile: it gets a hard timeout, a SIGKILL rather than a polite SIGTERM
 * when it overruns, and a capped output buffer. LibreOffice in particular is
 * the memory hog this whole architecture is arranged around
 * (ARCHITECTURE.md §3) — it is spawned one-shot and never kept resident.
 */

export type RunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  ms: number;
};

const MAX_OUTPUT_BYTES = 256 * 1024;

export async function run(
  command: string,
  args: string[],
  options: {
    timeoutMs: number;
    cwd?: string | undefined;
    env?: NodeJS.ProcessEnv | undefined;
    /** `nice` value; conversions run at low priority so the web stays snappy. */
    nice?: number | undefined;
  },
): Promise<RunResult> {
  const startedAt = Date.now();

  const [bin, binArgs] =
    options.nice != null && process.platform !== "win32"
      ? ["nice", ["-n", String(options.nice), command, ...args]]
      : [command, args];

  return new Promise<RunResult>((resolve) => {
    const child = spawn(bin!, binArgs!, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const append = (target: "out" | "err", chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (target === "out") {
        if (stdout.length < MAX_OUTPUT_BYTES) stdout += text;
      } else if (stderr.length < MAX_OUTPUT_BYTES) {
        stderr += text;
      }
    };

    child.stdout.on("data", (chunk: Buffer) => append("out", chunk));
    child.stderr.on("data", (chunk: Buffer) => append("err", chunk));

    // SIGKILL, not SIGTERM: a wedged soffice ignores the polite signal, and a
    // conversion that will not die holds 350 MB on a 2 GB box.
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        code: null,
        stdout,
        stderr: `${stderr}\n${error.message}`,
        timedOut,
        ms: Date.now() - startedAt,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, ms: Date.now() - startedAt });
    });
  });
}

/** Whether a binary is on PATH — used to fail with a useful message. */
export async function isAvailable(command: string): Promise<boolean> {
  const result = await run("which", [command], { timeoutMs: 5000 });
  return result.code === 0;
}
