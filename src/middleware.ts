import { NextResponse, type NextRequest } from "next/server";

/**
 * Route protection.
 *
 * Deliberately a *cookie presence* check, not a session validation: middleware
 * runs on the edge runtime where Prisma cannot go, and doing a database
 * lookup here would put one on every static asset request. The real check is
 * `requireUser()` in the page or handler, which every protected surface calls.
 * This exists to redirect cleanly instead of flashing a broken page.
 */
const PROTECTED = [
  "/dashboard",
  "/l/",
  "/d/",
  "/study",
  "/settings",
  "/onboarding",
];

const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const needsAuth = PROTECTED.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
  if (!needsAuth) return NextResponse.next();

  const hasSession = SESSION_COOKIES.some(
    (name) => request.cookies.get(name)?.value,
  );
  if (hasSession) return NextResponse.next();

  // Preserve where they were going, so signing in lands them there.
  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: [
    // Everything except Next internals, the auth API and static files.
    "/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)",
  ],
};
