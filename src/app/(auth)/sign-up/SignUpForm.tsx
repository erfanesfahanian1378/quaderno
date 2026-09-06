"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, Input } from "@/components/ui";
import { api, handler } from "@/lib/api-client";

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

    const result = await api.post("/api/auth/register", {
      email,
      password,
      name: String(form.get("name") ?? "") || undefined,
    });

    if (!result.ok) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    // The register endpoint already established the session — email
    // verification is a reminder, not a gate. Making someone check their inbox
    // before they can try the app is how you lose them at the door.
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
