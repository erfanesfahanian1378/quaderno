"use client";

import { INK_KEYS, HIGHLIGHT_KEYS } from "@/lib/tokens";
import { TEXT_FONTS, type TextFont } from "@/lib/richtext";
import { cn } from "@/lib/cn";

/**
 * Bold, italic, underline, colour and font, applied to the current selection.
 *
 * `execCommand` is deprecated and every browser emits different markup for
 * it — `<b>` here, `<strong>` there, an inline style somewhere else. That is
 * survivable only because the markup is never stored: the note is serialised
 * by reading COMPUTED styles back out (src/lib/richtext.ts), so all three
 * spellings collapse to the same record. Nothing has replaced execCommand for
 * this job, and a hand-rolled selection editor would break IME and mobile
 * carets, which matters more here than an API's deprecation notice.
 *
 * Every button uses `onMouseDown` with `preventDefault`. `onClick` fires
 * after focus has already left the editor, and by then there is no selection
 * left to format.
 */
const FONT_LABEL: Record<TextFont, string> = {
  ui: "Sans",
  reading: "Serif",
  mono: "Mono",
};

const FONT_CSS: Record<TextFont, string> = {
  ui: "var(--font-ui)",
  reading: "var(--font-reading)",
  mono: "var(--font-mono)",
};

export function FormatBar({
  onCommand,
  className,
}: {
  /** Runs against the editor, which the caller keeps focused. */
  onCommand: (run: () => void) => void;
  className?: string;
}) {
  const exec = (command: string, value?: string) =>
    onCommand(() => {
      // Ask for CSS rather than tags where the browser offers the choice —
      // it is the spelling the serialiser reads most reliably.
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand(command, false, value);
    });

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      <Toggle label="B" title="Bold" onPress={() => exec("bold")} bold />
      <Toggle label="I" title="Italic" onPress={() => exec("italic")} italic />
      <Toggle
        label="U"
        title="Underline"
        onPress={() => exec("underline")}
        underline
      />

      <span className="mx-0.5 h-5 w-px bg-hairline" aria-hidden="true" />

      {[...INK_KEYS, ...HIGHLIGHT_KEYS].map((key) => (
        <button
          key={key}
          type="button"
          title={key}
          aria-label={`Colour: ${key}`}
          onMouseDown={(event) => {
            event.preventDefault();
            onCommand(() => {
              document.execCommand("styleWithCSS", false, "true");
              // The RESOLVED value, because execCommand cannot take a custom
              // property. The serialiser maps it back to this token key.
              const probe = document.createElement("span");
              probe.style.color = `var(--${key})`;
              document.body.appendChild(probe);
              const resolved = getComputedStyle(probe).color;
              probe.remove();
              document.execCommand("foreColor", false, resolved);
            });
          }}
          className="size-5 rounded-full border border-hairline transition-transform hover:scale-110"
          style={{ background: `var(--${key})` }}
        />
      ))}

      <span className="mx-0.5 h-5 w-px bg-hairline" aria-hidden="true" />

      {TEXT_FONTS.map((font) => (
        <button
          key={font}
          type="button"
          title={`${FONT_LABEL[font]} font`}
          onMouseDown={(event) => {
            event.preventDefault();
            exec("fontName", FONT_CSS[font]);
          }}
          className="h-6 rounded-sm px-1.5 text-caption text-ink-2 hover:bg-subtle hover:text-ink"
          style={{ fontFamily: FONT_CSS[font] }}
        >
          {FONT_LABEL[font]}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  label,
  title,
  onPress,
  bold,
  italic,
  underline,
}: {
  label: string;
  title: string;
  onPress: () => void;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(event) => {
        event.preventDefault();
        onPress();
      }}
      className={cn(
        "grid size-6 place-items-center rounded-sm text-caption text-ink-2 hover:bg-subtle hover:text-ink",
        bold && "font-bold",
        italic && "italic",
        underline && "underline",
      )}
    >
      {label}
    </button>
  );
}
