import "dotenv/config";
import { prisma } from "../src/server/repositories/client";

/** Finds a note page for the test user, or makes one, and returns its id. */
async function main() {
  const userId = "cmtqdp48p0000itsyu2m8z33i";
  const documentId = "cmtqdp8au000bitsy36812prq";

  const existing = await prisma.leaf.findFirst({
    where: { documentId, kind: "NOTE_PAGE" },
    select: { notePageId: true },
  });
  if (existing?.notePageId) {
    console.log(existing.notePageId);
    await prisma.$disconnect();
    return;
  }

  const last = await prisma.leaf.findFirst({
    where: { documentId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const page = await prisma.notePage.create({
    data: { content: "" },
    select: { id: true },
  });
  await prisma.leaf.create({
    data: {
      documentId,
      kind: "NOTE_PAGE",
      notePageId: page.id,
      position: Number(last?.position ?? 0) + 1,
      label: "Vocabolario",
    },
  });
  console.log(page.id);
  console.log("(user", userId, ")");
  await prisma.$disconnect();
}
void main();
