"use client";

import { useState } from "react";

/**
 * "Continue with Google".
 *
 * A plain form POST to Auth.js's own sign-in endpoint rather than the
 * `signIn()` helper: that helper is the client half of a library this app
 * otherwise only uses on the server, and importing it here pulls the whole
 * of next-auth's client runtime into the auth bundle for one button.
 *
 * The csrf token is fetched on submit rather than on mount. Auth.js rejects a
 * POST without it, and a token fetched at render is one more request on every
 * visit to the sign-in page for something most visitors will not press.
 */
export function GoogleButton({
  next,
  label = "Continue with Google",
}: {
  next: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/auth/csrf");
      const { csrfToken } = (await response.json()) as { csrfToken: string };

      // Built and submitted rather than fetched: the response is a redirect to
      // Google, and the browser has to follow it as a navigation.
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/api/auth/signin/google";

      for (const [name, value] of Object.entries({
        csrfToken,
        callbackUrl: next,
      })) {
        const field = document.createElement("input");
        field.type = "hidden";
        field.name = name;
        field.value = value;
        form.append(field);
      }

      document.body.append(form);
      form.submit();
    } catch {
      // Offline, or the endpoint is unreachable. Let them try again rather
      // than leaving a button spinning for ever.
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={loading}
      className="flex h-12 w-full items-center justify-center gap-2.5 rounded-sm border border-hairline-strong bg-surface text-label text-ink transition-colors duration-[120ms] hover:bg-subtle disabled:opacity-60"
    >
      <GoogleMark />
      {loading ? "Taking you to Google…" : label}
    </button>
  );
}

/**
 * Google's mark, in its own colours.
 *
 * Their branding terms require the official four-colour G rather than a
 * monochrome icon, and it must not be recoloured to match the page — so this
 * one does not use currentColor.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-[18px]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/** A labelled rule, for putting the button and the form on either side of. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-hairline" />
      <span className="text-caption text-ink-3">or</span>
      <span className="h-px flex-1 bg-hairline" />
    </div>
  );
}
