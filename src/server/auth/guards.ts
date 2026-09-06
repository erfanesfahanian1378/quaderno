import { redirect } from "next/navigation";
import { unauthenticated } from "../errors";
import type { Ctx } from "../repositories/base";
import { getSession } from "./session";

/**
 * The one line every route handler and Server Action starts with.
 *
 * ARCHITECTURE.md §7: "There is no 'optional auth' branch inside app routes."
 * A handler either has a `Ctx` or it threw. That is what makes the repository
 * layer's mandatory scoping reachable — you cannot call a repository without a
 * userId, and you cannot get a userId without a session.
 */
export async function requireUser(): Promise<Ctx> {
  const session = await getSession();
  if (!session) throw unauthenticated();
  return { userId: session.userId };
}

/** Page-level variant: redirects to sign-in, preserving the intended URL. */
export async function requireUserPage(returnTo?: string): Promise<Ctx> {
  const session = await getSession();
  if (!session) {
    redirect(
      returnTo ? `/sign-in?next=${encodeURIComponent(returnTo)}` : "/sign-in",
    );
  }
  return { userId: session.userId };
}

/** For pages that should bounce an already-signed-in user away. */
export async function currentUserId(): Promise<string | null> {
  return (await getSession())?.userId ?? null;
}
