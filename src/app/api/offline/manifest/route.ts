import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import * as documents from "@/server/repositories/document";
import * as languages from "@/server/repositories/language";

/**
 * Everything this person's copy of the app should hold before it loses signal.
 *
 * The service worker can precache the build — it cannot know that this reader
 * has four languages and thirty documents, because those are urls the server
 * makes up. So the server names them, and the worker fetches them.
 *
 * Deliberately a list of URLS, not of records. The worker's job is to fetch
 * and store responses; giving it ids would mean teaching it how the app
 * constructs routes, and then every new route would need a worker change.
 */
export const GET = wrap(async () => {
  const ctx = await requireUser();

  const [langs, recent] = await Promise.all([
    languages.list(ctx),
    /*
     * Recently opened first, then a cap.
     *
     * Warming every document page of a large library is a lot of requests for
     * pages most of which will not be opened. Recency is the best available
     * guess at what someone is about to want, and anything missed still opens
     * normally with a connection — and can be kept explicitly with the Offline
     * button, which is the deliberate path.
     */
    documents.list(ctx, {}, { limit: 40 }, "recent"),
  ]);

  const pages: string[] = [];

  // The library as each language's own view, which is how it is reached from
  // the sidebar — `/library` alone is not the page anyone lands on.
  for (const language of langs) {
    pages.push(`/library?languageId=${encodeURIComponent(language.id)}`);
    pages.push(`/review?languageId=${encodeURIComponent(language.id)}`);
  }

  for (const document of recent.items) pages.push(`/d/${document.id}`);

  /*
   * API reads the client makes for itself.
   *
   * These are the ones no page renders on the server: a deck list is fetched
   * after mount, and offline that fetch is the difference between a review
   * screen and an empty one.
   */
  const api = langs.map(
    (language) => `/api/decks?languageId=${encodeURIComponent(language.id)}`,
  );

  return NextResponse.json({
    pages,
    api,
    documents: recent.items.map((item) => ({
      id: item.id,
      title: item.title,
    })),
  });
});
