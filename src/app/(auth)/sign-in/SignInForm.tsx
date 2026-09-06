"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banner, Button, Input } from "@/components/ui";
import { api, handler } from "@/lib/api-client";

export function SignInForm({
  next,
  initialError,
}: {
  next: string;
  initialError: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const result = await api.post("/api/auth/sign-in", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });

    if (!result.ok) {
      // One message for every failure mode. "No such account" and "wrong
      // password" must not be distinguishable — except for a rate limit,
      // which the user needs to be able to act on.
      setError(
        result.error.code === "RATE_LIMITED"
          ? result.error.message
          : "Email or password is incorrect.",
      );
      setLoading(false);
      return;
    }

    router.push(next);
    router.refresh();
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
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        autoFocus
        disabled={loading}
      />
      <Input
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        required
        disabled={loading}
      />

      <Button type="submit" size="lg" loading={loading}>
        Sign in
      </Button>

      <Link
        href="/forgot"
        className="text-body-sm text-ink-2 underline hover:text-ink"
      >
        Forgot your password?
      </Link>
    </form>
  );
}
