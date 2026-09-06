/**
 * UUID v4 that works outside a secure context.
 *
 * `crypto.randomUUID()` is **secure-context only**. It exists on
 * `https://…` and on `localhost`, and is `undefined` on a plain-HTTP LAN
 * address — which is exactly how this app gets opened on a phone:
 * `http://192.168.1.235:3000`. Calling it there throws
 * "crypto.randomUUID is not a function" and takes the whole page down.
 *
 * That is not an edge case for this product. DESIGN_BRIEF §2 puts "phone or
 * tablet on the desk, in class" first among the three moments to design
 * around, and annotation `clientId`s are generated on exactly that device.
 *
 * `crypto.getRandomValues()` is NOT secure-context restricted, so the fallback
 * is still cryptographically random — it is only the convenience wrapper that
 * is missing. The last resort exists so a very old browser degrades to a
 * working app rather than a stack trace; ids only need to be unique per user,
 * and the server's `@@unique([userId, clientId])` is what actually enforces
 * that.
 */

const HEX: string[] = Array.from({ length: 256 }, (_, index) =>
  index.toString(16).padStart(2, "0"),
);

function fromBytes(bytes: Uint8Array): string {
  // RFC 4122 §4.4: set the version to 4 and the variant to 10xx.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => HEX[byte]!);

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export function uuid(): string {
  const source = globalThis.crypto;

  // The fast path, when the page is on https or localhost.
  if (typeof source?.randomUUID === "function") {
    return source.randomUUID();
  }

  // Plain HTTP: randomUUID is gone but getRandomValues is not.
  if (typeof source?.getRandomValues === "function") {
    return fromBytes(source.getRandomValues(new Uint8Array(16)));
  }

  // No Web Crypto at all. Not random enough for a secret, which is fine —
  // this only ever generates an idempotency key scoped to one user.
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return fromBytes(bytes);
}

/** True when `crypto.randomUUID` is available — i.e. a secure context. */
export function isSecureContextCrypto(): boolean {
  return typeof globalThis.crypto?.randomUUID === "function";
}
