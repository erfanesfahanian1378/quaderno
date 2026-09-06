"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Banner, Button, Input } from "@/components/ui";
import { handler } from "@/lib/api-client";

export function SignUpForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        name: String(form.get("name") ?? "") || undefined,
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? "Could not create the account.");
      setLoading(false);
      return;
    }

    // Sign them straight in. Email verification is a reminder, not a gate —
    // making someone check their inbox before they can try the app is how you
    // lose them at the door.
    await signIn("credentials", { email, password, redirect: false });
    router.push("/onboarding");
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
        name="name"
        label="Name"
        hint="Optional — what we call you in the app."
        autoComplete="name"
        disabled={loading}
      />
      <Input
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        disabled={loading}
      />
      <Input
        name="password"
        type="password"
        label="Password"
        autoComplete="new-password"
        hint="At least 8 characters. A short phrase beats a clever word."
        required
        minLength={8}
        disabled={loading}
      />

      <Button type="submit" size="lg" loading={loading}>
        Create account
      </Button>
    </form>
  );
}
