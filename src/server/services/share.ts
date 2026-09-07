import { randomBytes } from "node:crypto";

/**
 * A share token.
 *
 * 24 bytes of CSPRNG output, base64url. That is 192 bits — far past guessing,
 * which matters because the token IS the credential and the route it opens is
 * the only unauthenticated surface in the app.
 *
 * base64url rather than hex so it stays short enough to paste into a message
 * without wrapping, and rather than a random-string helper because
 * `Math.random` is not a source of secrets.
 */
export function shareToken(): string {
  return randomBytes(24).toString("base64url");
}
