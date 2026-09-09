import { describe, expect, it } from "vitest";
import { formatBytes } from "@/lib/bytes";

describe("formatBytes", () => {
  it("keeps a round limit round", () => {
    // The upload limit is written into UI copy as "The limit is 150 MB".
    // A decimal here would read as machine output.
    expect(formatBytes(150 * 1024 ** 2)).toBe("150 MB");
  });

  it("keeps a decimal where it carries meaning", () => {
    // Nine-point-four megabytes of a ten megabyte budget is a different
    // situation from nine, and rounding hides it.
    expect(formatBytes(9.4 * 1024 ** 2)).toBe("9.4 MB");
  });

  it("uses the largest unit that fits", () => {
    expect(formatBytes(1024 ** 3)).toBe("1.0 GB");
    expect(formatBytes(10 * 1024 ** 3)).toBe("10 GB");
    expect(formatBytes(5 * 1024)).toBe("5.0 KB");
  });

  it("reports small sizes in bytes rather than rounding them up to a kilobyte", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(0)).toBe("0 B");
  });

  it("never renders a negative size", () => {
    // Storage estimates have come back below zero on at least one browser.
    expect(formatBytes(-5)).toBe("0 B");
  });
});
