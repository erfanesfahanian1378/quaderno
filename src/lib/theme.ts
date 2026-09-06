/**
 * Theme resolution.
 *
 * Three states, per DESIGN_BRIEF §5.13: light | dark | system. The stored
 * preference is the user's choice; the *resolved* theme is what actually
 * paints. "system" resolves at paint time from prefers-color-scheme and is
 * never written to the DOM as a data-theme value.
 */

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "quaderno.theme";
export const THEME_COOKIE = "quaderno_theme";

export function isTheme(value: string | undefined | null): value is Theme {
  return value != null && (THEMES as readonly string[]).includes(value);
}

/**
 * The script that runs before first paint. It is inlined into <head> as a
 * blocking <script> — that is the whole point. Anything async, including a
 * React effect, paints the wrong theme first and then corrects it, which is
 * the flash PHASE-01 §3 forbids.
 *
 * Kept dependency-free and small enough to read: it may not import anything,
 * because it executes before any bundle has loaded.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (stored !== "light" && stored !== "dark" && stored !== "system") {
      var m = document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);
      stored = m ? decodeURIComponent(m[1]) : "system";
    }
    var resolved = stored;
    if (stored === "system") {
      resolved = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    var root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.dataset.themePreference = stored;
    root.style.colorScheme = resolved;
  } catch (e) {
    /* Private mode, blocked storage: fall through to the CSS defaults, which
       already handle prefers-color-scheme on their own. */
  }
})();
`.trim();

/** Applies a preference to the DOM and persists it. Client-only. */
export function applyTheme(theme: Theme): ResolvedTheme {
  const resolved: ResolvedTheme =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;

  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.dataset.themePreference = theme;
  root.style.colorScheme = resolved;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can throw outright when the browser blocks site data.
  }
  // Mirrored to a cookie so the server can render the right theme on a cold
  // load, before any JS has run.
  document.cookie = `${THEME_COOKIE}=${encodeURIComponent(theme)}; path=/; max-age=31536000; SameSite=Lax`;

  return resolved;
}
