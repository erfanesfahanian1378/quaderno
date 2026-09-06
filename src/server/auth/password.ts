import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing.
 *
 * argon2id at the parameters ARCHITECTURE.md §7 specifies: m=19456 (19 MiB),
 * t=2, p=1. **Never bcrypt** — it silently truncates at 72 bytes and its work
 * factor does not scale with memory, which is the whole point of a modern
 * KDF.
 *
 * 19 MiB per hash matters on a 2 GB box: it bounds how many logins can be
 * verified concurrently, which is exactly why login is also rate limited.
 */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

/**
 * Returns false rather than throwing on a malformed hash: a corrupted row
 * must read as "wrong password", never as a 500 that tells an attacker the
 * account exists.
 */
export async function verifyPassword(
  plain: string,
  passwordHash: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}

/**
 * Constant-ish work for accounts that have no password (OAuth-only) or do not
 * exist. Without it, "no such user" returns in 1 ms and "wrong password"
 * takes 40 ms, and that difference enumerates your user table.
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$8Y7kZ3nJqR7wF2xNvL1pQeH5tK9mS4bV6cX0dY8aZ3g";

export async function burnTimeLikeAVerify(): Promise<void> {
  await verifyPassword("not-a-real-password", DUMMY_HASH);
}
