import { requireUserPage } from "@/server/auth/guards";
import * as users from "@/server/repositories/user";
import * as languages from "@/server/repositories/language";
import * as study from "@/server/services/study";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { LanguageSettings } from "@/components/settings/LanguageSettings";
import { HighlighterLabels } from "@/components/settings/HighlighterLabels";
import { SignOutButton } from "@/components/settings/SignOutButton";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requireUserPage("/settings");

  const [user, list, goals] = await Promise.all([
    users.findById(ctx),
    languages.list(ctx, { includeArchived: true }),
    study.goals(ctx),
  ]);
  if (!user) notFound();

  const usedRatio =
    Number(user.storageQuotaBytes) > 0
      ? Number(user.storageUsedBytes) / Number(user.storageQuotaBytes)
      : 0;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-reading text-display text-ink">Settings</h1>
      </header>

      <Section title="Profile">
        <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="text-body text-ink">{user.name ?? "No name set"}</p>
            <p className="text-body-sm text-ink-2">{user.email}</p>
            <p className="mt-1 text-caption text-ink-3">
              {user.timeZone} · week starts{" "}
              {user.weekStartsOn === 1 ? "Monday" : "Sunday"}
            </p>
          </div>
          <SignOutButton />
        </Card>
      </Section>

      <Section
        title="Languages"
        note="Rename, set a level, pick a colour, or archive one you are not studying now."
      >
        <LanguageSettings
          languages={list}
          goals={[...goals].map(([languageId, targetMinutes]) => ({
            languageId,
            targetMinutes,
          }))}
        />
      </Section>

      <Section
        title="Highlighter labels"
        note="What each colour means to you. The label travels with the colour into the picker, the annotations list and the export."
      >
        <HighlighterLabels />
      </Section>

      <Section title="Appearance">
        <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="text-body text-ink">Theme</p>
            <p className="text-body-sm text-ink-2">
              System follows your device.
            </p>
          </div>
          <ThemeToggle />
        </Card>
      </Section>

      <Section title="Storage">
        <Card className="p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-body text-ink">
              {formatBytes(Number(user.storageUsedBytes))} used
            </p>
            <p className="text-body-sm text-ink-2">
              of {formatBytes(Number(user.storageQuotaBytes))}
            </p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-inset">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.min(100, usedRatio * 100)}%` }}
            />
          </div>
        </Card>
      </Section>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-h3 text-ink">{title}</h2>
        {note ? (
          <p className="mt-0.5 max-w-[70ch] text-body-sm text-ink-2">{note}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} kB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
