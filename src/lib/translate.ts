"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

/**
 * What a word means, fetched as you look at it.
 *
 * Debounced, because this is wired to an input someone types into and each
 * keystroke would otherwise be a request against providers that rate-limit
 * hard. The server caches every answer, so the second lookup of a word costs
 * a database read — and because the route is a GET, the service worker keeps
 * it too, which is what makes a looked-up word available with no connection.
 */

export type Translation =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; text: string; source: string }
  | { status: "error"; message: string };

const DEBOUNCE_MS = 450;

export function useTranslation(
  text: string,
  from: string,
  enabled = true,
): Translation {
  const [state, setState] = useState<Translation>({ status: "idle" });

  useEffect(() => {
    const query = text.trim();

    if (!enabled || !query) {
      setState({ status: "idle" });
      return;
    }

    // A stale response must never overwrite a newer one: someone typing
    // "finestra" fires several lookups and they can land out of order.
    let live = true;
    setState({ status: "loading" });

    const timer = setTimeout(() => {
      void api
        .get<{ text: string; source: string }>(
          `/api/translate?q=${encodeURIComponent(query)}&from=${encodeURIComponent(from)}`,
        )
        .then((result) => {
          if (!live) return;

          setState(
            result.ok
              ? {
                  status: "done",
                  text: result.data.text,
                  source: result.data.source,
                }
              : { status: "error", message: result.error.message },
          );
        });
    }, DEBOUNCE_MS);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [text, from, enabled]);

  return state;
}
