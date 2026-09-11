import { prisma } from "@/server/repositories/client";
import { env } from "@/server/env";
import { libretranslate, lingva, mymemory, type Provider } from "./providers";

/**
 * Translating a word or a short phrase, for free.
 *
 * Two rules shape everything here.
 *
 * **Cache first, always.** The free providers rate-limit by IP hard enough
 * that a class looking up twenty words in a minute will start seeing
 * failures. A shared cache turns the twentieth lookup of "la finestra" into a
 * database read, and it is shared rather than per-user because the answer does
 * not depend on who is asking.
 *
 * **Short text only.** The cap is not about cost; it is about what gets
 * stored. A cached dictionary word is a dictionary. A cached paragraph out of
 * somebody's private notes, in a table other accounts read from, is not — so
 * anything longer is translated and returned without being written down.
 */

/** Beyond this, translate but do not cache. See above. */
export const CACHE_MAX_CHARS = 200;

/** Beyond this, refuse: it is a document, not a phrase. */
export const MAX_CHARS = 2000;

export type Result = {
  text: string;
  /** "cache" when it never left the database. */
  source: string;
};

function providers(): Provider[] {
  const list: Provider[] = [];

  // Self-hosted first when present: the only one where the text stays put.
  const local = env().TRANSLATE_URL;
  if (local) {
    list.push(libretranslate(local, env().TRANSLATE_API_KEY));
  }

  list.push(lingva(env().LINGVA_URL));
  list.push(mymemory());
  return list;
}

/** Trimmed and lowercased, so casing never splits the cache. */
function normalise(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function translate(input: {
  text: string;
  from: string;
  to: string;
}): Promise<Result | null> {
  const text = input.text.trim().replace(/\s+/g, " ");
  if (!text || text.length > MAX_CHARS) return null;

  // Nothing to do, and no reason to spend a request finding that out.
  if (input.from === input.to) return { text, source: "cache" };

  const key = normalise(text);
  const cacheable = key.length <= CACHE_MAX_CHARS;

  if (cacheable) {
    const hit = await prisma.translation.findUnique({
      where: {
        sourceLang_targetLang_sourceText: {
          sourceLang: input.from,
          targetLang: input.to,
          sourceText: key,
        },
      },
      select: { translated: true },
    });

    if (hit) return { text: hit.translated, source: "cache" };
  }

  for (const provider of providers()) {
    /*
     * A timeout per provider, not for the whole chain.
     *
     * A public instance that hangs rather than refusing would otherwise eat
     * the entire request and the fallbacks would never be tried — which is
     * the failure the chain exists to prevent.
     */
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    try {
      const answer = await provider.translate({
        text,
        from: input.from,
        to: input.to,
        signal: controller.signal,
      });

      if (!answer?.trim()) continue;

      // MyMemory shouts: "THE NEIGHBOURHOOD". Only fix a result that is ALL
      // caps and was not shouted at us in the first place.
      const cleaned =
        answer === answer.toUpperCase() && text !== text.toUpperCase()
          ? answer.toLowerCase()
          : answer;

      if (cacheable) {
        await prisma.translation
          .create({
            data: {
              sourceLang: input.from,
              targetLang: input.to,
              sourceText: key,
              translated: cleaned,
              provider: provider.name,
            },
          })
          .catch(() => {
            // A race with another request that cached the same word first.
            // Both have the same answer; neither needs to hear about it.
          });
      }

      return { text: cleaned, source: provider.name };
    } catch {
      // Timed out, refused, or returned something unparseable. Next one.
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}
