import type { TextSpan } from "@/lib/richtext";

/**
 * Renders formatted note text.
 *
 * Elements are built from the span structure — never `dangerouslySetInnerHTML`
 * — so nothing a user typed can become markup no matter what a
 * contenteditable produced when they typed it.
 */
const FONT_CLASS: Record<string, string> = {
  ui: "font-ui",
  reading: "font-reading",
  mono: "font-mono",
};

export function RichText({
  spans,
  text,
}: {
  spans?: TextSpan[] | undefined;
  /** The plain-text fallback, for notes written before formatting existed. */
  text: string;
}) {
  if (!spans || spans.length === 0) return <>{text}</>;

  return (
    <>
      {spans.map((span, index) => (
        <span
          // Spans have no identity of their own; they are a flat list that is
          // rewritten wholesale on every edit, so the index is the only key
          // there is and is stable for the render it belongs to.
          key={index}
          className={span.f ? FONT_CLASS[span.f] : undefined}
          style={{
            ...(span.b ? { fontWeight: 700 } : {}),
            ...(span.i ? { fontStyle: "italic" } : {}),
            ...(span.u ? { textDecoration: "underline" } : {}),
            // Inherit the annotation's colour when the span sets none.
            ...(span.c ? { color: `var(--${span.c})` } : {}),
          }}
        >
          {span.t}
        </span>
      ))}
    </>
  );
}
