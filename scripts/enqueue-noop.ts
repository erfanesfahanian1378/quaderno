/**
 * Enqueues one `noop` job, then exits. Paired with `pnpm worker:dev` this is
 * the PHASE-01 proof that the queue works end to end:
 *
 *   terminal 1:  pnpm worker:dev
 *   terminal 2:  pnpm tsx scripts/enqueue-noop.ts "hello"
 */
import { enqueue, stopBoss } from "../worker/queue";
import { QUEUES } from "../worker/queue";

async function main() {
  const message = process.argv[2] ?? "hello from enqueue-noop";
  const id = await enqueue(QUEUES.noop, {
    message,
    at: new Date().toISOString(),
  });
  console.log(`[enqueue] sent noop job ${id ?? "(deduplicated)"}: ${message}`);
  await stopBoss();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
