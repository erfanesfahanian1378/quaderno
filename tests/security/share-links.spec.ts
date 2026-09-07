// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyIntegrationEnv, databaseReachable } from "../setup/integration";
import type { prisma as PrismaInstance } from "@/server/repositories/client";
import type * as shareLinkRepository from "@/server/repositories/share-link";

type PrismaClient = typeof PrismaInstance;
type ShareLinks = typeof shareLinkRepository;

/**
 * PHASE-15 acceptance criteria:
 *
 *   "A share link opens the document read-only for a signed-out visitor, and
 *    revoking it returns 404 — not 403."
 *   "A share token for document A cannot read document B."
 *
 * The second one is the reason this file exists. A share token is the only
 * credential in the app that is not a session, and the failure mode — a token
 * that widens into an identity — is the worst bug this codebase could have.
 */

const OWNER = "share-owner@test.local";
const OTHER = "share-other@test.local";

let available = false;
let prisma: PrismaClient;
let shares: ShareLinks;

let ownerId = "";
let otherId = "";
let documentA = "";
let documentB = "";

beforeAll(async () => {
  applyIntegrationEnv();
  available = await databaseReachable();
  if (!available) {
    console.warn("[skip] Postgres is not reachable");
    return;
  }

  ({ prisma } = await import("@/server/repositories/client"));
  shares = await import("@/server/repositories/share-link");

  await prisma.user.deleteMany({ where: { email: { in: [OWNER, OTHER] } } });

  const makeUser = async (email: string) =>
    (
      await prisma.user.create({
        data: { email, name: email, passwordHash: "x" },
        select: { id: true },
      })
    ).id;

  ownerId = await makeUser(OWNER);
  otherId = await makeUser(OTHER);

  const makeDocument = async (userId: string, title: string) => {
    const language = await prisma.language.create({
      data: { userId, code: "it", name: "Italiano" },
      select: { id: true },
    });
    return (
      await prisma.document.create({
        data: {
          userId,
          languageId: language.id,
          title,
          status: "READY",
          origin: "UPLOAD",
        },
        select: { id: true },
      })
    ).id;
  };

  documentA = await makeDocument(ownerId, "A");
  documentB = await makeDocument(otherId, "B");
});

afterAll(async () => {
  if (!available) return;
  await prisma.user.deleteMany({ where: { email: { in: [OWNER, OTHER] } } });
  await prisma.$disconnect();
});

describe("share links", () => {
  it("resolves a live token to its owner and document", async () => {
    if (!available) return;

    const ctx = { userId: ownerId };
    const link = await shares.create(ctx, {
      documentId: documentA,
      token: "test-token-live",
    });

    const resolved = await shares.resolveToken(link.token);
    expect(resolved).toEqual({
      userId: ownerId,
      documentId: documentA,
      shareLinkId: link.id,
    });
  });

  it("grants exactly one document, never the owner's others", async () => {
    if (!available) return;

    const second = await prisma.document.create({
      data: {
        userId: ownerId,
        languageId: (
          await prisma.language.findFirstOrThrow({
            where: { userId: ownerId },
            select: { id: true },
          })
        ).id,
        title: "A2",
        status: "READY",
        origin: "UPLOAD",
      },
      select: { id: true },
    });

    const resolved = await shares.resolveToken("test-token-live");
    // The token names one document id. The page uses THAT id; there is no
    // path from a token to a listing.
    expect(resolved?.documentId).toBe(documentA);
    expect(resolved?.documentId).not.toBe(second.id);
  });

  it("cannot reach another user's document", async () => {
    if (!available) return;

    // The whole attack in one line: a token for A, used to ask for B.
    const resolved = await shares.resolveToken("test-token-live");
    const ctx = { userId: resolved!.userId };

    const documents = await import("@/server/repositories/document");
    const foreign = await documents.findById(ctx, documentB);

    // The repository is scoped to the OWNER of the token, and document B
    // belongs to someone else. Not found, not forbidden.
    expect(foreign).toBeNull();
  });

  it("stops resolving once revoked", async () => {
    if (!available) return;

    const ctx = { userId: ownerId };
    const link = await shares.create(ctx, {
      documentId: documentA,
      token: "test-token-revoked",
    });

    expect(await shares.resolveToken(link.token)).not.toBeNull();
    expect(await shares.revoke(ctx, link.id)).toBe(true);
    // null is what the route turns into a 404. A revoked link must not be
    // distinguishable from one that never existed.
    expect(await shares.resolveToken(link.token)).toBeNull();
  });

  it("cannot be revoked by anyone but its owner", async () => {
    if (!available) return;

    const link = await shares.create(
      { userId: ownerId },
      { documentId: documentA, token: "test-token-other-revokes" },
    );

    expect(await shares.revoke({ userId: otherId }, link.id)).toBe(false);
    expect(await shares.resolveToken(link.token)).not.toBeNull();
  });

  it("stops resolving once expired", async () => {
    if (!available) return;

    const link = await shares.create(
      { userId: ownerId },
      {
        documentId: documentA,
        token: "test-token-expired",
        expiresAt: new Date(Date.now() - 1000),
      },
    );

    expect(await shares.resolveToken(link.token)).toBeNull();
  });

  it("stops resolving when the document is deleted", async () => {
    if (!available) return;

    const language = await prisma.language.findFirstOrThrow({
      where: { userId: ownerId },
      select: { id: true },
    });
    const doomed = await prisma.document.create({
      data: {
        userId: ownerId,
        languageId: language.id,
        title: "Doomed",
        status: "READY",
        origin: "UPLOAD",
      },
      select: { id: true },
    });

    const link = await shares.create(
      { userId: ownerId },
      { documentId: doomed.id, token: "test-token-deleted" },
    );
    expect(await shares.resolveToken(link.token)).not.toBeNull();

    // Soft delete, which is what the app does.
    await prisma.document.update({
      where: { id: doomed.id },
      data: { deletedAt: new Date() },
    });

    expect(await shares.resolveToken(link.token)).toBeNull();
  });

  it("returns null for a token that was never issued", async () => {
    if (!available) return;
    expect(await shares.resolveToken("not-a-real-token")).toBeNull();
  });

  it("issues tokens with enough entropy to be a credential", async () => {
    const { shareToken } = await import("@/server/services/share");

    const tokens = new Set(Array.from({ length: 500 }, () => shareToken()));
    expect(tokens.size).toBe(500);

    // 24 bytes, base64url: 32 characters, no padding, url-safe alphabet.
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    }
  });
});
