import "dotenv/config";
import { prisma } from "../src/server/repositories/client";
import * as review from "../src/server/repositories/review";

async function main() {
  const ctx = { userId: "cmtqdp48p0000itsyu2m8z33i" };
  const all = await prisma.reviewCard.findMany({
    where: { userId: ctx.userId },
    select: {
      front: true,
      back: true,
      dueOn: true,
      languageId: true,
      retiredAt: true,
    },
  });
  console.log("cards in db:", all);
  try {
    console.log("due:", (await review.due(ctx, "2026-09-07")).length);
    console.log("count:", await review.dueCount(ctx, "2026-09-07"));
    console.log("byLanguage:", await review.dueByLanguage(ctx, "2026-09-07"));
  } catch (error) {
    console.error("REPO ERROR:", error);
  }
  await prisma.$disconnect();
}
void main();
