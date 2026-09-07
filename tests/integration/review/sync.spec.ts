// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyIntegrationEnv,
  databaseReachable,
} from "../../setup/integration";
import type { prisma as PrismaInstance } from "@/server/repositories/client";
import type { syncNotePage } from "@/server/services/review/sync";
import type * as reviewRepository from "@/server/repositories/review";

type PrismaClient = typeof PrismaInstance;
type SyncNotePage = typeof syncNotePage;
type ReviewRepository = typeof reviewRepository;

/**
 * PHASE-15's sharpest acceptance criterion:
 *
 *   "Editing a row updates its card and preserves its review history;
 *    deleting a row retires the card rather than orphaning it."
 *
 * Worth an integration test rather than a unit one, because the thing being
 * checked is that a *stored* schedule survives a re-sync. A mocked repository
 * would happily prove that the code calls the functions it calls.
 */

const EMAIL = "review-sync@test.local";
const TODAY = "2026-03-01";

const table = (rows: string[]) =>
  [
    "| Word | Translation | Example | Note |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n");

let available = false;
let prisma: PrismaClient;
let sync: SyncNotePage;
let review: ReviewRepository;

let userId = "";
let notePageId = "";
let ctx = { userId: "" };

beforeAll(async () => {
  applyIntegrationEnv();
  available = await databaseReachable();
  if (!available) {
    console.warn(
      "[skip] Postgres is not reachable — run `docker compose --profile dev up -d`",
    );
    return;
  }

  // Imported after the env is applied: these modules validate it at import.
  ({ prisma } = await import("@/server/repositories/client"));
  ({ syncNotePage: sync } = await import("@/server/services/review/sync"));
  review = await import("@/server/repositories/review");

  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await prisma.user.create({
    data: { email: EMAIL, name: "Review Sync", passwordHash: "x" },
    select: { id: true },
  });
  userId = user.id;
  ctx = { userId };

  const page = await prisma.notePage.create({
    data: { content: "" },
    select: { id: true },
  });
  notePageId = page.id;
});

afterAll(async () => {
  if (!available) return;
  await prisma.notePage.deleteMany({ where: { id: notePageId } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

describe("syncNotePage", () => {
  it("creates a card per filled-in row", async () => {
    if (!available) return;

    const result = await sync(ctx, {
      notePageId,
      languageId: null,
      todayKey: TODAY,
      content: table([
        "| il libro | the book | Leggo il libro. | m. |",
        "| la casa | the house |  |  |",
      ]),
    });

    expect(result).toMatchObject({ created: 2, updated: 0, retired: 0 });

    const cards = await review.forNotePage(ctx, notePageId);
    expect(cards.map((card) => card.front)).toEqual(["il libro", "la casa"]);
    // A word you just wrote down is one you are trying to learn now.
    expect(cards[0]?.dueOn).toBe(TODAY);
  });

  it("preserves the schedule when another cell is edited", async () => {
    if (!available) return;

    const before = await review.forNotePage(ctx, notePageId);
    const card = before.find((row) => row.front === "il libro")!;

    // Pretend it has been reviewed a few times.
    await prisma.reviewCard.update({
      where: { id: card.id },
      data: { ease: 2.9, intervalDays: 21, reps: 4, dueOn: "2026-04-01" },
    });

    await sync(ctx, {
      notePageId,
      languageId: null,
      todayKey: TODAY,
      content: table([
        "| il libro | the book (corrected) | Ho letto il libro. | maschile |",
        "| la casa | the house |  |  |",
      ]),
    });

    const after = await review.findById(ctx, card.id);
    expect(after?.back).toBe("the book (corrected)");
    expect(after?.example).toBe("Ho letto il libro.");
    // The whole point:
    expect(after?.intervalDays).toBe(21);
    expect(after?.ease).toBeCloseTo(2.9, 5);
    expect(after?.reps).toBe(4);
    expect(after?.dueOn).toBe("2026-04-01");
  });

  it("follows a typo fix in the word itself", async () => {
    if (!available) return;

    const before = await review.forNotePage(ctx, notePageId);
    const card = before.find((row) => row.front === "la casa")!;

    await prisma.reviewCard.update({
      where: { id: card.id },
      data: { intervalDays: 9, reps: 3 },
    });

    // The key changes, so only the position can match it. This is the case
    // that would silently reset history if pass 2 were missing.
    await sync(ctx, {
      notePageId,
      languageId: null,
      todayKey: TODAY,
      content: table([
        "| il libro | the book (corrected) | Ho letto il libro. | maschile |",
        "| la casà | the house |  |  |",
      ]),
    });

    const after = await review.findById(ctx, card.id);
    expect(after?.front).toBe("la casà");
    expect(after?.rowKey).toBe("la casà");
    expect(after?.intervalDays).toBe(9);
    expect(after?.reps).toBe(3);

    const all = await review.forNotePage(ctx, notePageId);
    expect(all).toHaveLength(2); // not three
  });

  it("retires a deleted row instead of orphaning it", async () => {
    if (!available) return;

    await sync(ctx, {
      notePageId,
      languageId: null,
      todayKey: TODAY,
      content: table([
        "| il libro | the book (corrected) | Ho letto il libro. | maschile |",
      ]),
    });

    const all = await review.forNotePage(ctx, notePageId);
    const retired = all.find((card) => card.front === "la casà");
    expect(retired?.retiredAt).toBeInstanceOf(Date);
    // Kept, with its history.
    expect(retired?.intervalDays).toBe(9);

    const due = await review.due(ctx, "2099-01-01");
    expect(due.map((card) => card.front)).not.toContain("la casà");
  });

  it("restores a row put back by hand, schedule and all", async () => {
    if (!available) return;

    await sync(ctx, {
      notePageId,
      languageId: null,
      todayKey: TODAY,
      content: table([
        "| il libro | the book (corrected) | Ho letto il libro. | maschile |",
        "| la casà | the house |  |  |",
      ]),
    });

    const all = await review.forNotePage(ctx, notePageId);
    const restored = all.find((card) => card.front === "la casà");
    expect(restored?.retiredAt).toBeNull();
    expect(restored?.intervalDays).toBe(9);
    expect(all).toHaveLength(2);
  });

  it("is a no-op when nothing changed", async () => {
    if (!available) return;

    const content = table([
      "| il libro | the book (corrected) | Ho letto il libro. | maschile |",
      "| la casà | the house |  |  |",
    ]);
    await sync(ctx, { notePageId, languageId: null, todayKey: TODAY, content });
    const result = await sync(ctx, {
      notePageId,
      languageId: null,
      todayKey: TODAY,
      content,
    });

    expect(result).toMatchObject({
      created: 0,
      updated: 0,
      retired: 0,
      total: 2,
    });
  });
});
