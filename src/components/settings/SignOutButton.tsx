"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui";
import { forgetEverything } from "@/lib/offline/warm";

export function SignOutButton() {
  const router = useRouter();

  return (
    <Button
      variant="secondary"
      onClick={() => {
        /*
         * Drop this device's cache BEFORE the session goes.
         *
         * Cached pages are rendered HTML holding one person's library,
         * schedule and notes. Left behind, the next person to sign in on this
         * device sees the previous one's dashboard for as long as the network
         * takes to answer — and offline, indefinitely.
         *
         * It runs first and its failure is not allowed to trap anyone in a
         * session they asked to leave.
         */
        void forgetEverything()
          .catch(() => {})
          .then(() => api.post("/api/auth/sign-out"))
          .then(() => {
            router.push("/sign-in");
            router.refresh();
          });
      }}
    >
      Sign out
    </Button>
  );
}
