import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { searchParams } from "@/server/api/request";
import { rateLimited } from "@/server/errors";
import { translate, MAX_CHARS } from "@/server/services/translate";

const schema = z.object({
  q: z.string().trim().min(1).max(MAX_CHARS),
  from: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{2}(-[a-z]{2})?$/i, "Use a language code such as it or fr"),
  to: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{2}(-[a-z]{2})?$/i)
    .default("en"),
});

/**
 * Translate a word or a short phrase.
 *
 * A GET, deliberately. The service worker caches same-origin API GETs, so a
 * word looked up once is available with no connection — which for a feature
 * whose whole purpose is "what does this mean" is most of the value. A POST
 * would be more conventional for a body of text and would lose that.
 *
 * Behind a session because it spends a shared rate limit, not because the
 * words are secret.
 */
export const GET = wrap(async (request) => {
  await requireUser();

  const params = searchParams(request);
  const input = schema.parse({
    q: params.get("q") ?? "",
    // Only the two-letter part: voices are tagged it-IT, providers want it.
    from: (params.get("from") ?? "").split("-")[0] ?? "",
    to: (params.get("to") ?? "en").split("-")[0] ?? "en",
  });

  const result = await translate({
    text: input.q,
    from: input.from,
    to: input.to,
  });

  /*
   * A failure here means every provider refused — usually all of them
   * rate-limiting at once. It is temporary, and saying so is the difference
   * between "try again in a minute" and "this feature is broken".
   */
  if (!result) {
    throw rateLimited(
      30,
      "No translation came back just now. The free services limit how often they answer — try again in a moment.",
    );
  }

  return NextResponse.json(result, {
    headers: {
      // A word's meaning does not change. Let the browser keep it too.
      "Cache-Control": "private, max-age=86400",
    },
  });
});
