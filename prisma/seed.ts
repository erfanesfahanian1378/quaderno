/**
 * Development seed.
 *
 * Creates the demo account from the README plus enough learning structure to
 * make the shell look like a real user's, not an empty state. Idempotent:
 * running it twice is a no-op, so it can be part of `db:reset` without care.
 *
 * The demo user's password hash is set in PHASE-02, which owns argon2id. Until
 * then the row exists so foreign keys and the tenancy tests have something to
 * point at.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@quaderno.app";

async function main() {
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      email: DEMO_EMAIL,
      name: "Demo",
      // PHASE-02 sets this to an argon2id hash of "quaderno".
      passwordHash: null,
      emailVerified: new Date(),
      locale: "en",
      timeZone: "Europe/Rome",
      weekStartsOn: 1,
      theme: "system",
    },
  });

  // Every language gets exactly one default course at creation — asserted by
  // an integration test in PHASE-03, so the seed must obey it too.
  const languages = [
    { code: "it", name: "Italiano", accentKey: "accent-1", cefrLevel: "B1" },
    { code: "fr", name: "Français", accentKey: "accent-2", cefrLevel: "A2" },
  ] as const;

  for (const [index, spec] of languages.entries()) {
    const language = await prisma.language.upsert({
      where: { userId_code: { userId: user.id, code: spec.code } },
      update: {},
      create: {
        userId: user.id,
        code: spec.code,
        name: spec.name,
        accentKey: spec.accentKey,
        cefrLevel: spec.cefrLevel,
        position: index,
      },
    });

    const existingDefault = await prisma.course.findFirst({
      where: { userId: user.id, languageId: language.id, isDefault: true },
      select: { id: true },
    });

    if (!existingDefault) {
      await prisma.course.create({
        data: {
          userId: user.id,
          languageId: language.id,
          name: "Self-study",
          isDefault: true,
        },
      });
    }

    // A weekly goal so the dashboard rings have something to draw. 3h is the
    // onboarding default (DESIGN_BRIEF §5.2).
    await prisma.weeklyGoal.upsert({
      where: {
        userId_languageId_effectiveFrom: {
          userId: user.id,
          languageId: language.id,
          effectiveFrom: new Date("2026-01-01"),
        },
      },
      update: {},
      create: {
        userId: user.id,
        languageId: language.id,
        targetMinutes: 180,
        effectiveFrom: new Date("2026-01-01"),
      },
    });
  }

  console.log(`Seeded ${DEMO_EMAIL} with ${languages.length} languages.`);
  console.log("Password login is wired in PHASE-02.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
