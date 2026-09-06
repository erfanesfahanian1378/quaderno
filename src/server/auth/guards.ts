import { redirect } from "next/navigation";
import { unauthenticated } from "../errors";
import type { Ctx } from "../repositories/base";
import { auth } from "./config";

/**
 * The one line every route handler and Server Action starts with.
 *
 * ARCHITECTURE.md §7: "There is no 'optional auth' branch inside app routes."
 * A handler either has a `Ctx` or it threw. That is what makes the repository
 * layer's mandatory scoping actually reachable — you cannot call a repository
 * without a userId, and you cannot get a userId without a session.
 */
export async function requireUser(): Promise<Ctx> {
  const session = await auth();
  if (!session?.user?.id) throw unauthenticated();
  return { userId: session.user.id };
}

/** Page-level variant: redirects to sign-in preserving where you were going. */
export async function requireUserPage(returnTo?: string): Promise<Ctx> {
  const session = await auth();
  if (!session?.user?.id) {
    const target = returnTo
      ? `/sign-in?next=${encodeURIComponent(returnTo)}`
      : "/sign-in";
    redirect(target);
  }
  return { userId: session.user.id };
}

/** For pages that should bounce an already-signed-in user away. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
