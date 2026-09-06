import { describe, expect, it } from "vitest";
import {
  assertKeyBelongsTo,
  exportKey,
  extensionForMime,
  normalisedPdfKey,
  originalKey,
  thumbnailKey,
  userPrefix,
} from "@/server/storage/keys";

const USER = "clx1user0000000000000000";
const DOC = "clx1doc00000000000000000";
const SRC = "clx1src00000000000000000";
const LEAF = "clx1leaf0000000000000000";

describe("storage keys", () => {
  it("builds the layout DATA_MODEL.md \u00a75 specifies", () => {
    expect(originalKey(USER, DOC, SRC, "application/pdf")).toBe(
      `u/${USER}/d/${DOC}/src/${SRC}/original.pdf`,
    );
    expect(normalisedPdfKey(USER, DOC, SRC)).toBe(
      `u/${USER}/d/${DOC}/src/${SRC}/normalised.pdf`,
    );
    expect(thumbnailKey(USER, DOC, LEAF)).toBe(
      `u/${USER}/d/${DOC}/thumb/${LEAF}.webp`,
    );
    expect(exportKey(USER, "clx1exp00000000000000000")).toBe(
      `u/${USER}/export/clx1exp00000000000000000.pdf`,
    );
  });

  it("puts every key under the owner's prefix", () => {
    const keys = [
      originalKey(USER, DOC, SRC, "image/png"),
      normalisedPdfKey(USER, DOC, SRC),
      thumbnailKey(USER, DOC, LEAF),
      exportKey(USER, "clx1exp00000000000000000"),
    ];
    for (const key of keys) {
      expect(key.startsWith(userPrefix(USER))).toBe(true);
    }
  });

  it("takes the extension from the MIME type, never from a filename", () => {
    expect(extensionForMime("application/pdf")).toBe(".pdf");
    expect(
      extensionForMime(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(".docx");
    expect(extensionForMime("image/jpeg")).toBe(".jpg");
    // An unknown type gets no extension rather than an attacker-supplied one.
    expect(extensionForMime("application/x-msdownload")).toBe("");
  });

  /**
   * The key builders are the last line of defence against input that got past
   * validation. A key is an object path, and ".." in one is how you read
   * somebody else's handout.
   */
  it.each([
    ["path traversal", "../../etc"],
    ["a slash", "abc/def"],
    ["an empty id", ""],
    ["a NUL byte", "abc\u0000def"],
    ["a bare dot-dot", ".."],
    ["a leading slash", "/etc/passwd"],
  ])("refuses to build a key from %s", (_label, badId) => {
    expect(() => originalKey(badId, DOC, SRC, "application/pdf")).toThrow();
    expect(() => thumbnailKey(USER, DOC, badId)).toThrow();
  });

  describe("assertKeyBelongsTo", () => {
    it("accepts a key inside the user's namespace", () => {
      expect(() =>
        assertKeyBelongsTo(USER, normalisedPdfKey(USER, DOC, SRC)),
      ).not.toThrow();
    });

    it("rejects another user's key", () => {
      const other = "clx1other000000000000000";
      expect(() =>
        assertKeyBelongsTo(USER, normalisedPdfKey(other, DOC, SRC)),
      ).toThrow(/outside the user's namespace/);
    });

    it("rejects a prefix that merely starts the same way", () => {
      // "u/abc/" must not match "u/abcdef/...".
      expect(() =>
        assertKeyBelongsTo("abc", "u/abcdef/d/x/original.pdf"),
      ).toThrow();
    });
  });
});
