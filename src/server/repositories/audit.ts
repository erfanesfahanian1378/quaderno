import { prisma } from "./client";

/**
 * Audit trail for destructive and security-relevant actions
 * (ARCHITECTURE.md §8). Deliberately fire-and-forget-ish: an audit write must
 * never fail the operation it is describing.
 */
export async function record(entry: {
  userId?: string | undefined;
  action: string;
  targetId?: string | undefined;
  ip?: string | undefined;
  userAgent?: string | undefined;
  meta?: Record<string, unknown> | undefined;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        targetId: entry.targetId ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        meta: entry.meta ? JSON.parse(JSON.stringify(entry.meta)) : undefined,
      },
    });
  } catch {
    // Swallowed on purpose. Losing an audit row is bad; failing a password
    // reset because the audit insert failed is worse.
  }
}

export async function listForUser(ctx: { userId: string }, limit = 50) {
  return prisma.auditLog.findMany({
    where: { userId: ctx.userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
    select: { id: true, action: true, ip: true, createdAt: true },
  });
}
