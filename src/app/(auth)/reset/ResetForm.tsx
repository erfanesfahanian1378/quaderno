"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, Input } from "@/components/ui";
import { handler } from "@/lib/api-client";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        password: String(form.get("password") ?? ""),
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(
        body?.error?.message ??
          "That link has expired or has already been used.",
      );
      setLoading(false);
      return;
    }

    router.push("/sign-in?reset=1");
  }

  return (
    <form
      onSubmit={handler(onSubmit, () => {
        setError("Could not reach the server. Check your connection.");
        setLoading(false);
      })}
      className="mt-8 flex flex-col gap-4"
    >
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Input
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        required
        minLength={8}
        autoFocus
        disabled={loading}
      />
      <Button type="submit" size="lg" loading={loading}>
        Set the new password
      </Button>
    </form>
  );
}
