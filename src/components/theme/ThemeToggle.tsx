"use client";

import { useEffect, useState } from "react";
import { applyTheme, isTheme, type Theme, THEMES } from "@/lib/theme";

const LABELS: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/**
 * Segmented control for light / dark / system.
 *
 * Reads its initial value from the DOM attribute the inline script already
 * set, rather than from storage, so the control and the page can never
 * disagree on the first frame.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const preference = document.documentElement.dataset.themePreference;
    if (isTheme(preference)) setTheme(preference);
  }, []);

  // A "system" preference has to keep tracking the OS while the page is open.
  useEffect(() => {
    if (theme !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex gap-1 rounded-sm border border-hairline bg-subtle p-1"
    >
      {THEMES.map((option) => {
        const active = option === theme;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              applyTheme(option);
              setTheme(option);
            }}
            className={[
              "rounded-sm px-3 py-1.5 text-label transition-colors duration-[120ms]",
              active
                ? "bg-surface text-ink shadow-e1"
                : "text-ink-2 hover:text-ink",
            ].join(" ")}
          >
            {LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
