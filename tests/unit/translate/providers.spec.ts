import { afterEach, describe, expect, it, vi } from "vitest";
import {
  libretranslate,
  lingva,
  mymemory,
} from "@/server/services/translate/providers";

/**
 * The providers, against the shapes they actually return.
 *
 * These were all written from live responses, and two of them encode a real
 * surprise. MyMemory answered `la finestra` with "the " — it is a translation
 * MEMORY returning crowd-sourced segments, and its headline field is often
 * worse than the scored candidates underneath it. Lingva answered three
 * French lookups in a row with a generic error purely because six requests
 * had gone out in ten seconds.
 *
 * Neither is a bug to fix; both are behaviour to survive, which is what the
 * fallback chain is for and what these tests pin down.
 */
const signal = new AbortController().signal;
const ask = { text: "la finestra", from: "it", to: "en", signal };

afterEach(() => {
  vi.unstubAllGlobals();
});

function respond(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      json: async () => body,
    }),
  );
}

describe("lingva", () => {
  it("reads the translation", async () => {
    respond({ translation: "the window", info: { detectedSource: "it" } });
    expect(await lingva("https://lingva.ml").translate(ask)).toBe("the window");
  });

  it("gives up rather than inventing an answer when rate-limited", async () => {
    // What a throttled instance actually returns: 200, with an error body.
    respond({ error: "An error occurred while retrieving the translation" });
    expect(await lingva("https://lingva.ml").translate(ask)).toBeNull();
  });

  it("gives up on a non-ok response", async () => {
    respond({ translation: "ignored" }, false);
    expect(await lingva("https://lingva.ml").translate(ask)).toBeNull();
  });
});

describe("mymemory", () => {
  it("prefers a high-quality match over the headline", async () => {
    /*
     * The exact shape that produced "the " for `la finestra`. Taking
     * `translatedText` at face value is the bug this guards.
     */
    respond({
      responseData: { translatedText: "the ", match: 1 },
      matches: [
        { translation: "the ", quality: 74 },
        { translation: "the window", quality: 90 },
      ],
    });
    expect(await mymemory().translate(ask)).toBe("the window");
  });

  it("falls back to the headline when every match scores badly", async () => {
    respond({
      responseData: { translatedText: "the window" },
      matches: [{ translation: "rubbish", quality: 10 }],
    });
    expect(await mymemory().translate(ask)).toBe("the window");
  });

  it("ignores blank matches", async () => {
    respond({
      responseData: { translatedText: "the window" },
      matches: [{ translation: "   ", quality: 99 }],
    });
    expect(await mymemory().translate(ask)).toBe("the window");
  });

  it("returns null when there is nothing usable at all", async () => {
    respond({ responseData: { translatedText: "" }, matches: [] });
    expect(await mymemory().translate(ask)).toBeNull();
  });
});

describe("libretranslate", () => {
  it("posts to /translate and reads translatedText", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ translatedText: "the window" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await libretranslate("http://localhost:5050").translate(ask)).toBe(
      "the window",
    );

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("http://localhost:5050/translate");
    expect(JSON.parse(String(init.body))).toMatchObject({
      q: "la finestra",
      source: "it",
      target: "en",
    });
  });

  it("sends an api key only when it has one", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ translatedText: "x" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await libretranslate("http://localhost:5050").translate(ask);
    const [, plain] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(String(plain.body))).not.toHaveProperty("api_key");

    await libretranslate("http://localhost:5050", "secret").translate(ask);
    const [, keyed] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(JSON.parse(String(keyed.body))).toHaveProperty("api_key", "secret");
  });
});
