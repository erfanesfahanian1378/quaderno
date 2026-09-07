"use client";

import { useEffect, useState } from "react";

/**
 * Whether the browser thinks it is online.
 *
 * `navigator.onLine` is optimistic — it reports true on a captive portal or a
 * dead wifi connection — so this is a hint for the UI, never a gate. Every
 * request still has to handle its own failure; the outbox already does.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);

    const up = () => setOnline(true);
    const down = () => setOnline(false);

    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return online;
}
