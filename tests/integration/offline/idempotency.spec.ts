// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyIntegrationEnv,
  databaseReachable,
} from "../../setup/integration";
import type { prisma as PrismaInstance } from "@/server/repositories/client";
import type * as idempotency from "@/server/api/idempotency";

type PrismaClient = typeof PrismaInstance;
type Idempotency = typeof idempotency;

/**
 * A queued write that is retried must land exactly once.
 *
 * This is the failure the offline queue makes possible: a write reaches the
 * server, the response is lost in a tunnel, the queue retries. Without a key,
 * the card is graded twice — its interval jumps, a second ReviewLog row
 * appears, and the reader has no way to notice or undo it.
 */
const EMAIL = "idempotency@test.local";

let available = false;
let prisma: PrismaClient;
let api: Idempotency;
let userId = "";

const ctx = () => ({ userId });

function requestWithKey(key: string | null): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    ...(key ? { headers: { "idempotency-key": key } } : {}),
  });
}

beforeAll(async () => {
  applyIntegrationEnv();
  available = await databaseReachable();
  if (!available) {
    console.warn("[skip] Postgres is not reachable");
    return;
  }

  ({ prisma } = await import("@/server/repositories/client"));
  api = await import("@/server/api/idempotency");

  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await prisma.user.create({
    data: { email: EMAIL, name: "Idem", passwordHash: "x" },
    select: { id: true },
  });
  userId = user.id;
});

afterAll(async () => {
  if (!available) return;
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

describe("withIdempotency", () => {
  it("runs the handler once for a repeated key", async () => {
    if (!available) return;

    let ran = 0;
    const handler = async () => {
      ran += 1;
      return { status: 200, body: { attempt: ran } };
    };

    const first = await api.withIdempotency(
      ctx(),
      requestWithKey("key-1"),
      "grade:card-1",
      handler,
    );
    const replay = await api.withIdempotency(
      ctx(),
      requestWithKey("key-1"),
      "grade:card-1",
      handler,
    );

    expect(ran).toBe(1);
    expect(await first.json()).toEqual({ attempt: 1 });
    // The replay returns the ORIGINAL response, so the client cannot tell.
    expect(await replay.json()).toEqual({ attempt: 1 });
    expect(replay.headers.get("x-idempotent-replay")).toBe("true");
  });

  it("preserves the original status on a replay", async () => {
    if (!available) return;

    const handler = async () => ({ status: 201, body: { id: "made" } });

    const first = await api.withIdempotency(
      ctx(),
      requestWithKey("key-created"),
      "comment:doc",
      handler,
    );
    const replay = await api.withIdempotency(
      ctx(),
      requestWithKey("key-created"),
      "comment:doc",
      handler,
    );

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
  });

  it("does not let a key be replayed at another endpoint", async () => {
    if (!available) return;

    let ran = 0;
    const handler = async () => {
      ran += 1;
      return { status: 200, body: { ran } };
    };

    await api.withIdempotency(
      ctx(),
      requestWithKey("key-scoped"),
      "grade:card-a",
      handler,
    );
    // Same key, different route. A stored response from grading must never
    // come back as the answer to posting a comment.
    await api.withIdempotency(
      ctx(),
      requestWithKey("key-scoped"),
      "comment:doc-b",
      handler,
    );

    expect(ran).toBe(2);
  });

  it("keys are per user", async () => {
    if (!available) return;

    const other = await prisma.user.create({
      data: { email: `other-${EMAIL}`, name: "Other", passwordHash: "x" },
      select: { id: true },
    });

    let ran = 0;
    const handler = async () => {
      ran += 1;
      return { status: 200, body: { ran } };
    };

    await api.withIdempotency(
      ctx(),
      requestWithKey("shared-key"),
      "grade:x",
      handler,
    );
    // Someone else's identical key must not suppress their write.
    await api.withIdempotency(
      { userId: other.id },
      requestWithKey("shared-key"),
      "grade:x",
      handler,
    );

    expect(ran).toBe(2);
    await prisma.user.deleteMany({ where: { id: other.id } });
  });

  it("runs every time when no key is sent", async () => {
    if (!available) return;

    let ran = 0;
    const handler = async () => {
      ran += 1;
      return { status: 200, body: { ran } };
    };

    // An online client sends no key and must be unaffected.
    await api.withIdempotency(ctx(), requestWithKey(null), "grade:y", handler);
    await api.withIdempotency(ctx(), requestWithKey(null), "grade:y", handler);

    expect(ran).toBe(2);
  });

  it("does not record a key when the handler throws", async () => {
    if (!available) return;

    const failing = async (): Promise<{ status: number; body: unknown }> => {
      throw new Error("nope");
    };

    await expect(
      api.withIdempotency(
        ctx(),
        requestWithKey("key-failed"),
        "grade:z",
        failing,
      ),
    ).rejects.toThrow();

    // Recording before the work would make a crash look like a completed
    // write and swallow the retry that would have fixed it.
    const stored = await prisma.idempotencyKey.findFirst({
      where: { userId, key: "key-failed" },
    });
    expect(stored).toBeNull();
  });

  it("sweeps keys older than the retry window", async () => {
    if (!available) return;

    await prisma.idempotencyKey.create({
      data: {
        userId,
        key: "ancient",
        scope: "grade:old",
        response: { status: 200, body: {} },
        createdAt: new Date(Date.now() - 60 * 86_400_000),
      },
    });

    await api.sweepIdempotencyKeys();

    expect(
      await prisma.idempotencyKey.findFirst({
        where: { userId, key: "ancient" },
      }),
    ).toBeNull();
    // Recent ones survive.
    expect(
      await prisma.idempotencyKey.findFirst({
        where: { userId, key: "key-1" },
      }),
    ).not.toBeNull();
  });
});
