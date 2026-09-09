/**
 * File sizes, for people.
 *
 * There were two of these: one inside `compress-pdf`, one private to the
 * settings page, and they disagreed — `kB` against `KB`, whole megabytes
 * against one decimal. Neither was wrong so much as unowned.
 *
 * It lives on its own because of where the copies were: `compress-pdf` is a
 * `"use client"` module that dynamically imports pdfjs-dist to rasterise
 * pages, so importing a string helper from it pulls a PDF engine into
 * whatever chunk asked. On a settings page that is several hundred kilobytes
 * for one label, and in dev it is how a route ends up throwing
 * "Cannot read properties of undefined (reading 'call')" on its first
 * compile.
 */

const UNITS = [
  { limit: 1024 ** 3, suffix: "GB" },
  { limit: 1024 ** 2, suffix: "MB" },
  { limit: 1024, suffix: "KB" },
] as const;

/**
 * One decimal below ten, none above.
 *
 * "9.4 MB" and "150 MB" are both what someone would say out loud; "9 MB"
 * loses the half that matters when a quota is close, and "150.0 MB" is a
 * limit written by a machine.
 */
export function formatBytes(bytes: number): string {
  const size = Math.max(0, bytes);

  for (const unit of UNITS) {
    if (size < unit.limit) continue;
    const value = size / unit.limit;
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${unit.suffix}`;
  }

  return `${Math.round(size)} B`;
}
