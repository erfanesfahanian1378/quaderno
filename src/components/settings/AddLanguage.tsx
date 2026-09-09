"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, handler } from "@/lib/api-client";
import { Banner, Button } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Adding a second language, from Settings.
 *
 * There was no way to do this after onboarding. The only "Add a language"
 * control in the app lived in the sidebar, which exists from `lg` up — so on
 * a phone it was invisible — and it pointed at /settings/languages, which is
 * a 404. So the control was unreachable on mobile and broken on desktop, and
 * the languages panel told people to "add one from the sidebar".
 *
 * The presets are the same eight as onboarding. Anything else is typed, since
 * a list of every ISO 639-1 code is a worse experience than a text field for
 * the person who wants Swahili.
 */
const COMMON = [
  { code: "it", name: "Italiano" },
  { code: "fr", name: "Français" },
  { code: "es", name: "Español" },
  { code: "de", name: "Deutsch" },
  { code: "pt", name: "Português" },
  { code: "nl", name: "Nederlands" },
  { code: "ja", name: "日本語" },
  { code: "ar", name: "العربية" },
] as const;

export function AddLanguage({ existing }: { existing: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = (nextName: string, nextCode: string) =>
    handler(
      async () => {
        const trimmedName = nextName.trim();
        const trimmedCode = nextCode.trim().toLowerCase();
        if (!trimmedName || !trimmedCode) return;

        setBusy(true);
        setError(null);

        const result = await api.post("/api/languages", {
          name: trimmedName,
          code: trimmedCode,
        });
        setBusy(false);

        if (!result.ok) {
          setError(result.error.message);
          return;
        }

        setOpen(false);
        setName("");
        setCode("");
        router.refresh();
      },
      () => setBusy(false),
    );

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Add a language
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <div className="flex flex-wrap gap-2">
        {COMMON.map((entry) => {
          /*
           * A language already added is shown and disabled rather than
           * removed. A row of chips that silently loses one is harder to read
           * than a row where the one you have is visibly taken.
           */
          const already = existing.includes(entry.code);

          return (
            <button
              key={entry.code}
              type="button"
              disabled={already || busy}
              onClick={add(entry.name, entry.code)}
              className={cn(
                "h-9 rounded-full border px-3 text-body-sm transition-colors duration-[120ms]",
                already
                  ? "cursor-not-allowed border-hairline bg-inset text-ink-3"
                  : "border-hairline-strong bg-surface text-ink hover:bg-subtle",
              )}
            >
              {entry.name}
              {already ? " ✓" : ""}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-ink-3">Or another — name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Svenska"
            maxLength={60}
            className="h-9 w-[160px] rounded-sm border border-hairline-strong bg-surface px-3 text-body text-ink"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-caption text-ink-3">code</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="sv"
            maxLength={8}
            className="h-9 w-[72px] rounded-sm border border-hairline-strong bg-surface px-3 text-body text-ink"
          />
        </label>

        <Button
          size="sm"
          loading={busy}
          disabled={!name.trim() || !code.trim()}
          onClick={add(name, code)}
        >
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>

      <p className="text-caption text-ink-3">
        The code is the two-letter one used for the voice and the keyboard — it
        for Italian, fr for French.
      </p>
    </div>
  );
}
