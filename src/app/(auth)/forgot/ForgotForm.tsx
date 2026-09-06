"use client";

import { useState } from "react";
import { Banner, Button, Input } from "@/components/ui";
import { handler } from "@/lib/api-client";

export function ForgotForm() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const form = new FormData(event.currentTarget);
    await fetch("/api/auth/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: String(form.get("email") ?? "") }),
    });

    // Always the same outcome, whether or not the address exists.
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="mt-8">
        <Banner tone="success">
          If that address has an account, a reset link is on its way. It is good
          for one hour.
        </Banner>
        <p className="mt-4 text-body-sm text-ink-3">
          In development the link is printed in the terminal running{" "}
          <code className="font-mono">pnpm dev</code>.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handler(onSubmit, () => setLoading(false))}
      className="mt-8 flex flex-col gap-4"
    >
      <Input
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        autoFocus
        disabled={loading}
      />
      <Button type="submit" size="lg" loading={loading}>
        Send the link
      </Button>
    </form>
  );
}
