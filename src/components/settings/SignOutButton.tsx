"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui";

export function SignOutButton() {
  const router = useRouter();

  return (
    <Button
      variant="secondary"
      onClick={() => {
        void api.post("/api/auth/sign-out").then(() => {
          router.push("/sign-in");
          router.refresh();
        });
      }}
    >
      Sign out
    </Button>
  );
}
