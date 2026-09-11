/**
 * Where a translation can come from.
 *
 * Three, tried in order, because the free ones are individually unreliable in
 * ways that are easy to mistake for a bug. Lingva returned "the window" for
 * `la finestra` and then failed three French lookups in a row purely because
 * six requests had gone out in ten seconds — it rate-limits by IP and says so
 * with a generic error. A single provider would have made that look like
 * "French is broken".
 *
 * Self-hosted LibreTranslate comes first when it is configured: it is the
 * only one where the text never leaves the machine, which matters because the
 * text being translated is whatever someone highlighted in their own notes.
 */

export type Provider = {
  readonly name: string;
  translate(input: Request): Promise<string | null>;
};

export type Request = {
  text: string;
  from: string;
  to: string;
  signal: AbortSignal;
};

/**
 * Self-hosted LibreTranslate. Nothing leaves the machine.
 *
 * `docker compose --profile translate up -d` starts one; see compose.yaml.
 * It is off by default because the models want about a gigabyte of RAM, which
 * is most of a small server.
 */
export function libretranslate(url: string, apiKey?: string): Provider {
  return {
    name: "libretranslate",
    async translate({ text, from, to, signal }) {
      const response = await fetch(new URL("/translate", url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: text,
          source: from,
          target: to,
          format: "text",
          ...(apiKey ? { api_key: apiKey } : {}),
        }),
        signal,
      });

      if (!response.ok) return null;

      const data = (await response.json()) as { translatedText?: unknown };
      return typeof data.translatedText === "string"
        ? data.translatedText
        : null;
    },
  };
}

/** A free Google Translate front end. Good output, aggressive rate limits. */
export function lingva(host: string): Provider {
  return {
    name: "lingva",
    async translate({ text, from, to, signal }) {
      const path = `/api/v1/${from}/${to}/${encodeURIComponent(text)}`;
      const response = await fetch(new URL(path, host), { signal });

      if (!response.ok) return null;

      const data = (await response.json()) as { translation?: unknown };
      return typeof data.translation === "string" ? data.translation : null;
    },
  };
}

/**
 * MyMemory: a translation MEMORY, not an engine.
 *
 * It answers with crowd-sourced segments, so the headline result can be
 * nonsense — `la finestra` came back as "the ". The `matches` array carries a
 * quality score per candidate, and reading that instead of `translatedText`
 * is the difference between a usable fallback and a misleading one.
 */
export function mymemory(): Provider {
  return {
    name: "mymemory",
    async translate({ text, from, to, signal }) {
      const url = new URL("https://api.mymemory.translated.net/get");
      url.searchParams.set("q", text);
      url.searchParams.set("langpair", `${from}|${to}`);

      const response = await fetch(url, { signal });
      if (!response.ok) return null;

      const data = (await response.json()) as {
        responseData?: { translatedText?: unknown };
        matches?: { translation?: unknown; quality?: unknown }[];
      };

      const best = (data.matches ?? [])
        .map((match) => ({
          text: typeof match.translation === "string" ? match.translation : "",
          quality: Number(match.quality ?? 0),
        }))
        .filter((match) => match.text.trim().length > 0)
        .sort((a, b) => b.quality - a.quality)[0];

      // A high-scoring match beats the headline; the headline beats nothing.
      if (best && best.quality >= 60) return best.text;

      const headline = data.responseData?.translatedText;
      return typeof headline === "string" && headline.trim() ? headline : null;
    },
  };
}
