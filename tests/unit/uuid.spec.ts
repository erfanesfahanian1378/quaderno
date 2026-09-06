import { afterEach, describe, expect, it, vi } from "vitest";
import { uuid } from "@/lib/uuid";

/**
 * `crypto.randomUUID` is secure-context only. This app is opened on a phone
 * over a plain-HTTP LAN address — which is the FIRST of the three moments
 * DESIGN_BRIEF §2 designs around — and there it is simply undefined.
 *
 * That bug took the whole library page down with
 * "crypto.randomUUID is not a function" the first time someone opened it on a
 * phone. These tests pin each fallback level so it cannot come back.
 */

const V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const realCrypto = globalThis.crypto;

afterEach(() => {
  Object.defineProperty(globalThis, "crypto", {
    value: realCrypto,
    configurable: true,
    writable: true,
  });
  vi.restoreAllMocks();
});

function setCrypto(value: unknown): void {
  Object.defineProperty(globalThis, "crypto", {
    value,
    configurable: true,
    writable: true,
  });
}

describe("uuid", () => {
  it("uses crypto.randomUUID when the context is secure", () => {
    const randomUUID = vi.fn(() => "11111111-2222-4333-8444-555555555555");
    setCrypto({ randomUUID, getRandomValues: realCrypto.getRandomValues });

    expect(uuid()).toBe("11111111-2222-4333-8444-555555555555");
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("falls back to getRandomValues on plain HTTP", () => {
    // Exactly the shape of a phone on http://192.168.x.x — randomUUID gone,
    // getRandomValues still there.
    setCrypto({
      getRandomValues: (array: Uint8Array) => {
        for (let i = 0; i < array.length; i += 1) array[i] = i * 7 + 3;
        return array;
      },
    });

    const value = uuid();

    expect(value).toMatch(V4);
    // Version and variant nibbles must still be RFC-correct.
    expect(value[14]).toBe("4");
    expect("89ab").toContain(value[19]);
  });

  it("still returns a valid v4 with no Web Crypto at all", () => {
    setCrypto(undefined);
    expect(uuid()).toMatch(V4);
  });

  it("does not repeat itself", () => {
    setCrypto({
      getRandomValues: (array: Uint8Array) => realCrypto.getRandomValues(array),
    });

    const seen = new Set(Array.from({ length: 2000 }, () => uuid()));
    expect(seen.size).toBe(2000);
  });

  it("keeps producing distinct ids even on the last-resort path", () => {
    setCrypto(undefined);
    const seen = new Set(Array.from({ length: 2000 }, () => uuid()));
    // Math.random collisions over 122 bits are not a realistic worry; this
    // guards against the generator being accidentally deterministic.
    expect(seen.size).toBe(2000);
  });
});
