/**
 * The worker process.
 *
 * Separate from the web container on purpose: it is the only image that
 * carries LibreOffice, qpdf and ocrmypdf (ARCHITECTURE.md §9), and it is the
 * process that bursts to ~350 MB during a conversion. Keeping it apart is
 * what lets the web container stay small and stay up while a conversion runs.
 *
 * Phase 01 registers one job — `noop` — to prove the path. Phases 04, 07 and
 * 08 add ingest, OCR, export and the timer reaper here.
 */
import { getBoss, stopBoss } from "./queue";
import { registerNoop } from "./jobs/noop";
import { registerIngest } from "./jobs/document-ingest";
import { registerOcr } from "./jobs/document-ocr";
import { registerExport } from "./jobs/document-export";
import { registerTimerReaper } from "./jobs/timer-reaper";

async function main(): Promise<void> {
  const boss = await getBoss();
  console.log("[worker] pg-boss started");

  await registerNoop(boss);
  await registerIngest(boss);
  await registerOcr(boss);
  await registerExport(boss);
  await registerTimerReaper(boss);
  console.log(
    "[worker] registered: noop, document.ingest, document.ocr, document.export, study.timer-reaper",
  );

  console.log("[worker] ready");
}

/**
 * Graceful shutdown matters here: SIGKILLing mid-conversion is what leaves a
 * document stuck in CONVERTING. pg-boss re-delivers an unacked job, so a clean
 * stop plus re-delivery is the whole recovery story.
 */
function shutdown(signal: string): void {
  console.log(`[worker] ${signal} received, stopping`);
  stopBoss()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("[worker] failed to stop cleanly", error);
      process.exit(1);
    });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((error) => {
  console.error("[worker] failed to start", error);
  process.exit(1);
});
