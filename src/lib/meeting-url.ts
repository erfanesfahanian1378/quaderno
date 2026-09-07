/**
 * Meeting links.
 *
 * A class link is user-supplied text that becomes an `href` — which is
 * exactly the shape of a stored-XSS bug. `javascript:` and `data:` URLs both
 * execute when clicked, and a link is rendered on the dashboard where it is
 * the most inviting thing on the page. So the scheme is checked against an
 * allowlist rather than a blocklist, at the boundary, before storage.
 *
 * `http:` is allowed alongside `https:` only because a school's internal
 * conferencing box sometimes is not on TLS. Nothing else is.
 */
const ALLOWED_PROTOCOLS = new Set(["https:", "http:"]);

/** Recognised providers, for a label on the button. */
const PROVIDERS: { host: RegExp; name: string }[] = [
  { host: /(^|\.)meet\.google\.com$/i, name: "Google Meet" },
  { host: /(^|\.)zoom\.(us|com)$/i, name: "Zoom" },
  { host: /(^|\.)teams\.(microsoft|live)\.com$/i, name: "Teams" },
  { host: /(^|\.)webex\.com$/i, name: "Webex" },
  { host: /(^|\.)whereby\.com$/i, name: "Whereby" },
  { host: /(^|\.)meet\.jit\.si$/i, name: "Jitsi" },
  { host: /(^|\.)skype\.com$/i, name: "Skype" },
  { host: /(^|\.)discord\.(gg|com)$/i, name: "Discord" },
];

export type MeetingLink = {
  url: string;
  /** "Google Meet", "Zoom", … or the bare host for anything unrecognised. */
  provider: string;
};

/**
 * Normalise a pasted link, or return null.
 *
 * Accepts a bare `meet.google.com/abc-defg-hij` — people paste links without
 * the scheme constantly, and rejecting that would read as the field being
 * broken.
 */
export function parseMeetingUrl(input: string): MeetingLink | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  /*
   * Add a scheme only when there is none. Doing it unconditionally would turn
   * `javascript:alert(1)` into `https://javascript:alert(1)`, which parses
   * and looks harmless — the check below has to run against what the user
   * actually typed.
   */
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;
  if (!url.hostname || !url.hostname.includes(".")) return null;

  const provider =
    PROVIDERS.find((entry) => entry.host.test(url.hostname))?.name ??
    url.hostname.replace(/^www\./, "");

  return { url: url.toString(), provider };
}

export function isMeetingUrl(input: string): boolean {
  return parseMeetingUrl(input) !== null;
}
