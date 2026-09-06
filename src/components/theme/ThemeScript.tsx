import { THEME_INIT_SCRIPT } from "@/lib/theme";

/**
 * Blocking inline script in <head>. Must stay a plain <script> with
 * dangerouslySetInnerHTML — next/script defers, and a deferred theme script
 * is a flash of the wrong theme.
 */
export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
      suppressHydrationWarning
    />
  );
}
