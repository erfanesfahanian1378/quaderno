import { describe, expect, it } from "vitest";
import {
  ACCENT_KEYS,
  ACCENT_NAMES,
  HIGHLIGHT_DEFAULT_LABELS,
  HIGHLIGHT_KEYS,
  INK_KEYS,
  isAccentKey,
  isHighlightKey,
  nextAccentKey,
} from "@/lib/tokens";

describe("token keys", () => {
  it("has the six accents the brief specifies, each with a name", () => {
    expect(ACCENT_KEYS).toHaveLength(6);
    for (const key of ACCENT_KEYS) {
      expect(ACCENT_NAMES[key]).toBeTruthy();
    }
  });

  it("has the five highlighters, each with a default label", () => {
    expect(HIGHLIGHT_KEYS).toHaveLength(5);
    for (const key of HIGHLIGHT_KEYS) {
      expect(HIGHLIGHT_DEFAULT_LABELS[key]).toBeTruthy();
    }
  });

  it("has the four pen inks", () => {
    expect(INK_KEYS).toHaveLength(4);
  });

  it("narrows unknown strings", () => {
    expect(isAccentKey("accent-3")).toBe(true);
    expect(isAccentKey("accent-9")).toBe(false);
    expect(isHighlightKey("hl-pink")).toBe(true);
    expect(isHighlightKey("#FFE27A")).toBe(false);
  });

  describe("nextAccentKey", () => {
    it("gives a new language a colour nobody else is using", () => {
      expect(nextAccentKey([])).toBe("accent-1");
      expect(nextAccentKey(["accent-1"])).toBe("accent-2");
      expect(nextAccentKey(["accent-1", "accent-2"])).toBe("accent-3");
    });

    it("fills a gap left by an archived language", () => {
      expect(nextAccentKey(["accent-1", "accent-3"])).toBe("accent-2");
    });

    it("wraps rather than failing once all six are taken", () => {
      const all = [...ACCENT_KEYS];
      expect(isAccentKey(nextAccentKey(all))).toBe(true);
    });
  });
});
