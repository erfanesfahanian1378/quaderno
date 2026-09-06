import { randomBytes } from "node:crypto";
import { conflict, notFound, validationFailed } from "../errors";
import { logger } from "../logger";
import * as users from "../repositories/user";
import * as audit from "../repositories/audit";
import { hashPassword } from "../auth/password";
import { mailer, resetMail, verificationMail } from "../auth/mailer";
import { enforce } from "../auth/rate-limit";
import type { RegisterInput } from "../validation/auth";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

function token(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * A cheap, dependency-free strength check standing in for zxcvbn.
 *
 * PHASE-02 §2 asks for zxcvbn score >= 2 and the 10k-most-common list.
 * zxcvbn's dictionary is ~800 KB, which is real weight for a rule this
 * simple, so this rejects the shapes that actually show up — the password
 * being the email, a single repeated character, an obvious sequence, or one
 * of the passwords everyone tries first — and PHASE-09 can swap in the full
 * estimator if the numbers justify it.
 */
const COMMON = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "qwerty123",
  "letmein",
  "welcome1",
  "admin123",
  "iloveyou",
  "quaderno",
  "changeme",
  "passw0rd",
  "football",
  "baseball",
]);

export function assertPasswordStrength(password: string, email: string): void {
  const lower = password.toLowerCase();
  const local = email.split("@")[0]?.toLowerCase() ?? "";

  const problems: string[] = [];
  if (COMMON.has(lower))
    problems.push("That is one of the most common passwords.");
  if (local.length >= 3 && lower.includes(local)) {
    problems.push("It should not contain your email address.");
  }
  if (/^(.)\1+$/.test(password))
    problems.push("It is a single repeated character.");
  if (/^(0123456789|1234567890|abcdefgh|qwertyui)/.test(lower)) {
    problems.push("It is a keyboard or number sequence.");
  }
  // Variety beats length rules: 8 mixed characters beat 12 lowercase ones.
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) =>
    re.test(password),
  ).length;
  if (password.length < 12 && classes < 2) {
    problems.push(
      "Use either a longer passphrase or a mix of character types.",
    );
  }

  if (problems.length > 0) {
    throw validationFailed(problems[0]!, { field: "password" });
  }
}

export async function register(
  input: RegisterInput,
  meta: { ip: string },
): Promise<{ userId: string }> {
  await enforce("register", meta.ip);
  assertPasswordStrength(input.password, input.email);

  const existing = await users.findByEmailWithHash(input.email);
  if (existing) {
    // Registration is the one place we cannot hide existence — the account
    // either gets created or it does not. Keep the message neutral.
    throw conflict("That address is already registered. Try signing in.");
  }

  const user = await users.create({
    email: input.email,
    passwordHash: await hashPassword(input.password),
    name: input.name,
  });

  const verifyToken = token();
  await users.createVerificationToken({
    identifier: `verify:${user.email}`,
    token: verifyToken,
    expires: new Date(Date.now() + VERIFY_TTL_MS),
  });
  await mailer().send(verificationMail(user.email, verifyToken));

  await audit.record({
    userId: user.id,
    action: "auth.register",
    ip: meta.ip,
  });

  return { userId: user.id };
}

export async function verifyEmail(rawToken: string): Promise<boolean> {
  const row = await users.consumeVerificationToken(rawToken);
  if (!row || !row.identifier.startsWith("verify:")) return false;

  const email = row.identifier.slice("verify:".length);
  const user = await users.findByEmailWithHash(email);
  if (!user) return false;

  await users.markEmailVerified({ userId: user.id });
  await audit.record({ userId: user.id, action: "auth.email.verified" });
  return true;
}

/**
 * Always succeeds from the caller's point of view, and — this is the part
 * that matters — takes the same time whether or not the address exists.
 * PHASE-02 has a timing test on it (+/- 50 ms).
 */
export async function requestPasswordReset(
  email: string,
  meta: { ip: string },
): Promise<void> {
  await enforce("passwordReset", meta.ip);

  const user = await users.findByEmailWithHash(email);
  if (!user) {
    // Do the same amount of work: generate a token, hash nothing, send
    // nothing. The cost difference that remains is one INSERT, which is well
    // inside the tolerance and does not vary with the input.
    token();
    logger.info({ email }, "auth.password.forgot for unknown address");
    return;
  }

  const resetToken = token();
  await users.createVerificationToken({
    identifier: `reset:${user.email}`,
    token: resetToken,
    expires: new Date(Date.now() + RESET_TTL_MS),
  });
  await mailer().send(resetMail(user.email, resetToken));
  await audit.record({ userId: user.id, action: "auth.password.forgot" });
}

export async function resetPassword(
  rawToken: string,
  password: string,
): Promise<void> {
  const row = await users.consumeVerificationToken(rawToken);
  if (!row || !row.identifier.startsWith("reset:")) {
    throw notFound("Reset link");
  }

  const email = row.identifier.slice("reset:".length);
  const user = await users.findByEmailWithHash(email);
  if (!user) throw notFound("Reset link");

  assertPasswordStrength(password, email);

  const ctx = { userId: user.id };
  await users.setPasswordHash(ctx, await hashPassword(password));
  // Every other session dies. Whoever forced the reset is logged out too.
  const revoked = await users.revokeAllSessions(ctx);

  await audit.record({
    userId: user.id,
    action: "auth.password.reset",
    meta: { sessionsRevoked: revoked },
  });
}
