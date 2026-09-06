import { notFound } from "next/navigation";
import { TokenTable } from "@/components/dev/TokenTable";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import {
  ACCENT_KEYS,
  ACCENT_NAMES,
  HIGHLIGHT_DEFAULT_LABELS,
  HIGHLIGHT_KEYS,
  INK_KEYS,
} from "@/lib/tokens";

export const metadata = { title: "Design tokens" };

/** The accented glyphs the app must never drop. DESIGN_BRIEF §3.3. */
const SPECIMEN = "à è é ì ò ù ç œ â ê î ô û ë ï ü";

const NEUTRAL_TOKENS = [
  "--bg-canvas",
  "--bg-surface",
  "--bg-subtle",
  "--bg-inset",
  "--border-subtle",
  "--border-strong",
] as const;

const TEXT_TOKENS = [
  "--text-primary",
  "--text-secondary",
  "--text-tertiary",
  "--text-inverse",
] as const;

const HL_TOKENS = HIGHLIGHT_KEYS.map((key) => `--${key}`);
const INK_TOKENS = INK_KEYS.map((key) => `--${key}`);
const SEMANTIC_TOKENS = [
  "--success",
  "--warning",
  "--danger",
  "--info",
] as const;
const ELEVATION_TOKENS = [
  "--elevation-1",
  "--elevation-2",
  "--elevation-3",
] as const;

const TYPE_STEPS = [
  { name: "display", cls: "text-display", spec: "32 / 38 · -0.02em · 600" },
  { name: "h1", cls: "text-h1", spec: "24 / 30 · -0.015em · 600" },
  { name: "h2", cls: "text-h2", spec: "20 / 26 · -0.01em · 600" },
  { name: "h3", cls: "text-h3", spec: "17 / 24 · -0.005em · 600" },
  { name: "body", cls: "text-body", spec: "15 / 23 · 400" },
  { name: "body-sm", cls: "text-body-sm", spec: "13 / 19 · 400" },
  { name: "label", cls: "text-label", spec: "13 / 16 · 0.005em · 500" },
  { name: "caption", cls: "text-caption", spec: "12 / 16 · 0.01em · 450" },
] as const;

const SPACE_STEPS = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const;

const RADII = [
  { name: "page", cls: "rounded-[var(--radius-page)]", spec: "2 — paper" },
  { name: "sm", cls: "rounded-sm", spec: "6 — inputs, chips" },
  { name: "md", cls: "rounded-md", spec: "10 — cards, buttons" },
  { name: "lg", cls: "rounded-lg", spec: "14 — panels, sheets" },
  { name: "full", cls: "rounded-full", spec: "avatars, timer pill" },
] as const;

export default function TokensPage() {
  // Dev-only route, per PHASE-01 "Out of scope".
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto max-w-[1120px] px-6 py-10">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-caption uppercase tracking-[0.08em] text-ink-3">
            foundation
          </p>
          <h1 className="mt-1 font-reading text-display text-ink">
            Design tokens
          </h1>
          <p className="mt-2 max-w-[60ch] text-body text-ink-2">
            Every value the code implements, read live out of the DOM. The two
            columns below are the same tokens under an explicitly themed
            subtree, so light and dark are comparable without toggling.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <Section title="Colour" note="Neutrals, both themes side by side.">
        <div className="grid gap-6 md:grid-cols-2">
          <ThemedColumn theme="light" label="Light">
            <TokenTable tokens={NEUTRAL_TOKENS} />
            <TokenTable tokens={TEXT_TOKENS} swatch="text" />
          </ThemedColumn>
          <ThemedColumn theme="dark" label="Dark">
            <TokenTable tokens={NEUTRAL_TOKENS} />
            <TokenTable tokens={TEXT_TOKENS} swatch="text" />
          </ThemedColumn>
        </div>
      </Section>

      <Section
        title="Language accents"
        note="One per language, user-changeable. Each carries base / soft / on."
      >
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {ACCENT_KEYS.map((key) => (
            <div
              key={key}
              data-accent={key}
              className="overflow-hidden rounded-md border border-hairline bg-surface"
            >
              <div className="flex h-14 items-end bg-accent p-2">
                <span className="text-caption font-medium text-accent-on">
                  Aa on
                </span>
              </div>
              <div className="h-6 bg-accent-soft" />
              <div className="p-2.5">
                <div className="text-label text-ink">{ACCENT_NAMES[key]}</div>
                <code className="font-mono text-caption text-ink-3">{key}</code>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Highlighters"
        note="A separate scale: they must read as ink on white paper and stay visible on an inverted dark page. Each carries a user-editable label — colour is never the only channel."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <ThemedColumn theme="light" label="Light — on paper">
            <HighlighterSpecimens />
            <TokenTable tokens={HL_TOKENS} />
          </ThemedColumn>
          <ThemedColumn theme="dark" label="Dark — on an inverted page">
            <HighlighterSpecimens />
            <TokenTable tokens={HL_TOKENS} />
          </ThemedColumn>
        </div>
      </Section>

      <Section title="Pen ink" note="Solid, not translucent. Same both themes.">
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex gap-2.5">
            {INK_KEYS.map((key) => (
              <div
                key={key}
                title={key}
                className="size-11 rounded-full"
                style={{ background: `var(--${key})` }}
              />
            ))}
          </div>
          <div className="min-w-[280px] flex-1">
            <TokenTable tokens={INK_TOKENS} />
          </div>
        </div>
      </Section>

      <Section title="Semantic">
        <div className="grid gap-6 md:grid-cols-2">
          <ThemedColumn theme="light" label="Light">
            <SemanticBanners />
            <TokenTable tokens={SEMANTIC_TOKENS} />
          </ThemedColumn>
          <ThemedColumn theme="dark" label="Dark">
            <SemanticBanners />
            <TokenTable tokens={SEMANTIC_TOKENS} />
          </ThemedColumn>
        </div>
      </Section>

      <Section
        title="Type"
        note="Inter for UI, Source Serif 4 for reading and note content, JetBrains Mono for code in notes."
      >
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="divide-y divide-hairline rounded-md border border-hairline bg-surface">
            {TYPE_STEPS.map((step) => (
              <div
                key={step.name}
                className="flex items-baseline justify-between gap-4 px-4 py-3"
              >
                <span className={`${step.cls} text-ink`}>
                  Il congiuntivo presente
                </span>
                <span className="shrink-0 font-mono text-caption text-ink-3">
                  {step.name} · {step.spec}
                </span>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4 px-4 py-3">
              <span className="font-reading text-note-body text-ink">
                note-body — the serif that makes a note page feel like a
                notebook rather than a form.
              </span>
              <span className="shrink-0 font-mono text-caption text-ink-3">
                note-body · 17 / 28
              </span>
            </div>
          </div>

          {/*
            The specimen line. If a glyph here renders as tofu, the font subset
            is wrong and the app is not shippable for Italian or French —
            DESIGN_BRIEF §3.3 and the PHASE-01 acceptance criteria.
          */}
          <div className="rounded-md border border-hairline bg-surface p-4">
            <p className="text-label text-ink-2">
              Latin Extended-A specimen — no tofu allowed
            </p>
            <p className="mt-3 font-ui text-h2 text-ink">{SPECIMEN}</p>
            <p className="mt-1 font-mono text-caption text-ink-3">Inter · UI</p>
            <p className="mt-4 font-reading text-h2 text-ink">{SPECIMEN}</p>
            <p className="mt-1 font-mono text-caption text-ink-3">
              Source Serif 4 · reading
            </p>
            <p className="mt-4 font-mono text-h3 text-ink">{SPECIMEN}</p>
            <p className="mt-1 font-mono text-caption text-ink-3">
              JetBrains Mono · code
            </p>
            <p className="mt-4 tabular text-h2 text-ink">00:47:12</p>
            <p className="mt-1 font-mono text-caption text-ink-3">
              tabular figures · the timer must not shimmy
            </p>
          </div>
        </div>
      </Section>

      <Section title="Space, radius, elevation">
        <div className="grid gap-8 lg:grid-cols-3">
          <div>
            <h3 className="mb-3 text-label text-ink-2">Space — 4px base</h3>
            <div className="flex flex-col gap-1.5">
              {SPACE_STEPS.map((step) => (
                <div key={step} className="flex items-center gap-3">
                  <div
                    className="h-3 bg-accent"
                    style={{ width: `${step}px` }}
                  />
                  <code className="font-mono text-caption text-ink-3">
                    {step}
                  </code>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-label text-ink-2">Radius</h3>
            <div className="flex flex-col gap-2.5">
              {RADII.map((radius) => (
                <div key={radius.name} className="flex items-center gap-3">
                  <div
                    className={`size-12 border border-hairline-strong bg-subtle ${radius.cls}`}
                  />
                  <div>
                    <code className="font-mono text-caption text-ink">
                      {radius.name}
                    </code>
                    <div className="text-caption text-ink-3">{radius.spec}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-label text-ink-2">
              Elevation — only three
            </h3>
            {/*
              Written out rather than interpolated: Tailwind scans source text
              for complete class names, and `shadow-${level}` produces none.
            */}
            <div className="mb-4 flex gap-4 rounded-md bg-canvas p-4">
              <div className="grid size-16 place-items-center rounded-md bg-surface font-mono text-caption text-ink-2 shadow-e1">
                e1
              </div>
              <div className="grid size-16 place-items-center rounded-md bg-surface font-mono text-caption text-ink-2 shadow-e2">
                e2
              </div>
              <div className="grid size-16 place-items-center rounded-md bg-surface font-mono text-caption text-ink-2 shadow-e3">
                e3
              </div>
            </div>
            <TokenTable tokens={ELEVATION_TOKENS} swatch="shadow" />
          </div>
        </div>
      </Section>

      <Section
        title="Motion"
        note="Nothing longer than 250ms, and everything respects prefers-reduced-motion."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["--motion-fast", "120ms ease-out", "hover, colour"],
            ["--motion-panel", "180ms panel curve", "panels, sheets"],
            ["--motion-page", "220ms", "page transitions"],
          ].map(([token, value, use]) => (
            <div
              key={token}
              className="rounded-md border border-hairline bg-surface p-3"
            >
              <code className="font-mono text-caption text-ink">{token}</code>
              <div className="mt-1 text-body-sm text-ink">{value}</div>
              <div className="text-caption text-ink-3">{use}</div>
            </div>
          ))}
        </div>
      </Section>
    </main>
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
    <section className="mb-12 border-t border-hairline pt-6">
      <h2 className="text-h2 text-ink">{title}</h2>
      {note ? (
        <p className="mb-5 mt-1 max-w-[70ch] text-body-sm text-ink-2">{note}</p>
      ) : (
        <div className="mb-5" />
      )}
      {children}
    </section>
  );
}

/**
 * A subtree with its own explicit theme. This is why the [data-theme] blocks
 * in tokens.css are not scoped to :root.
 */
function ThemedColumn({
  theme,
  label,
  children,
}: {
  theme: "light" | "dark";
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-theme={theme}
      className="flex flex-col gap-3 rounded-md border border-hairline bg-canvas p-4"
    >
      <span className="font-mono text-caption uppercase tracking-[0.06em] text-ink-3">
        {label}
      </span>
      {children}
    </div>
  );
}

function HighlighterSpecimens() {
  return (
    <div className="page-sheet flex flex-col gap-1 p-3">
      {HIGHLIGHT_KEYS.map((key) => (
        <div key={key} className="flex items-baseline gap-2">
          <span
            className="font-reading text-body text-ink"
            style={{
              background: `var(--${key})`,
              boxShadow: `0 0 0 2px var(--${key})`,
            }}
          >
            il congiuntivo
          </span>
          <span className="text-caption text-ink-2">
            {HIGHLIGHT_DEFAULT_LABELS[key]}
          </span>
        </div>
      ))}
    </div>
  );
}

function SemanticBanners() {
  const banners = [
    ["success", "Time logged — 1h 40m of Italian."],
    ["warning", "Converted from .docx — layout may differ."],
    ["danger", "Conversion failed. The original is still downloadable."],
    ["info", "3 changes queued. They will sync when you are back online."],
  ] as const;

  return (
    <div className="flex flex-col gap-2">
      {banners.map(([kind, message]) => (
        <div
          key={kind}
          className="flex items-center gap-2.5 rounded-sm px-3 py-2 text-body-sm"
          style={{
            background: `var(--${kind}-soft)`,
            color: `var(--${kind}-on-soft)`,
          }}
        >
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: `var(--${kind})` }}
          />
          {message}
        </div>
      ))}
    </div>
  );
}
