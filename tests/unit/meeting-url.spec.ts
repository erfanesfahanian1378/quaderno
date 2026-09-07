import { describe, expect, it } from "vitest";
import { isMeetingUrl, parseMeetingUrl } from "@/lib/meeting-url";

/**
 * A class link is user-supplied text that becomes an `href` on the dashboard,
 * which is the exact shape of a stored-XSS bug. These are the cases that
 * matter.
 */
describe("meeting links — what must be rejected", () => {
  it("rejects javascript:", () => {
    expect(parseMeetingUrl("javascript:alert(1)")).toBeNull();
    expect(parseMeetingUrl("JaVaScRiPt:alert(1)")).toBeNull();
    expect(parseMeetingUrl("  javascript:alert(1)  ")).toBeNull();
  });

  it("rejects data: and other executable schemes", () => {
    expect(
      parseMeetingUrl("data:text/html,<script>alert(1)</script>"),
    ).toBeNull();
    expect(parseMeetingUrl("vbscript:msgbox(1)")).toBeNull();
    expect(parseMeetingUrl("file:///etc/passwd")).toBeNull();
    expect(parseMeetingUrl("blob:https://evil.test/x")).toBeNull();
  });

  it("does not turn a dangerous scheme into a safe-looking URL", () => {
    // The trap: prefixing "https://" unconditionally makes
    // "javascript:alert(1)" parse as a host called "javascript". The scheme
    // has to be checked against what was actually typed.
    const result = parseMeetingUrl("javascript:alert(1)");
    expect(result).toBeNull();
  });

  it("rejects things that are not links at all", () => {
    expect(parseMeetingUrl("")).toBeNull();
    expect(parseMeetingUrl("   ")).toBeNull();
    expect(parseMeetingUrl("just some text")).toBeNull();
    expect(parseMeetingUrl("localhost")).toBeNull();
  });
});

describe("meeting links — what must be accepted", () => {
  it("takes a Google Meet link", () => {
    const link = parseMeetingUrl("https://meet.google.com/abc-defg-hij");
    expect(link?.provider).toBe("Google Meet");
    expect(link?.url).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("takes one pasted without the scheme, which is how people paste", () => {
    const link = parseMeetingUrl("meet.google.com/abc-defg-hij");
    expect(link?.url).toBe("https://meet.google.com/abc-defg-hij");
    expect(link?.provider).toBe("Google Meet");
  });

  it("recognises the other tools a class actually uses", () => {
    expect(parseMeetingUrl("https://us02web.zoom.us/j/123")?.provider).toBe(
      "Zoom",
    );
    expect(
      parseMeetingUrl("https://teams.microsoft.com/l/meetup-join/x")?.provider,
    ).toBe("Teams");
    expect(parseMeetingUrl("https://meet.jit.si/room")?.provider).toBe("Jitsi");
    expect(parseMeetingUrl("https://company.webex.com/meet/x")?.provider).toBe(
      "Webex",
    );
  });

  it("falls back to the host for anything it does not know", () => {
    expect(parseMeetingUrl("https://vc.university.edu/room/42")?.provider).toBe(
      "vc.university.edu",
    );
    expect(parseMeetingUrl("https://www.example.com/x")?.provider).toBe(
      "example.com",
    );
  });

  it("allows plain http for a school's own box", () => {
    expect(
      parseMeetingUrl("http://vc.school.local.example/room"),
    ).not.toBeNull();
  });

  it("keeps the query string, which is where meeting passwords live", () => {
    const link = parseMeetingUrl("https://us02web.zoom.us/j/123?pwd=SECRET");
    expect(link?.url).toContain("pwd=SECRET");
  });

  it("agrees with itself", () => {
    expect(isMeetingUrl("https://meet.google.com/x")).toBe(true);
    expect(isMeetingUrl("javascript:alert(1)")).toBe(false);
  });
});
