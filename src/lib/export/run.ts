"use client";

import type { PDFDocument } from "pdf-lib";
import { api } from "@/lib/api-client";
import type { ExportFlavour, ExportLeaf } from "./bake";
import { HIGHLIGHT_KEYS, INK_KEYS } from "@/lib/tokens";

/**
 * Runs an export in the browser and hands the user a file.
 *
 * Token keys are resolved to hexes **here**, once, by reading the computed
 * styles of the live document. That is the only correct place for it: the
 * database stores `hl-yellow`, and what that means depends on the theme the
 * page is currently in. Resolving it server-side would bake the wrong colour
 * into a dark-mode export.
 */

function resolveTokens(): Record<string, string> {
  const styles = getComputedStyle(document.documentElement);
  const out: Record<string, string> = {};

  for (const key of [...HIGHLIGHT_KEYS, ...INK_KEYS]) {
    const value = styles.getPropertyValue(`--${key}`).trim();
    out[key] = value || "#FFE27A";
  }

  return out;
}

/** Any CSS colour → hex, via a canvas, because pdf-lib only takes numbers. */
function toHex(color: string): string {
  if (color.startsWith("#")) {
    return color.length === 4
      ? `#${color
          .slice(1)
          .split("")
          .map((char) => char + char)
          .join("")}`
      : color;
  }

  const match = /rgba?\(([^)]+)\)/.exec(color);
  if (!match) return "#000000";

  const [r = 0, g = 0, b = 0] = match[1]!
    .split(",")
    .map((part) => Number(part.trim()));

  return `#${[r, g, b]
    .map((value) => Math.round(value).toString(16).padStart(2, "0"))
    .join("")}`;
}

export async function exportDocument(
  documentId: string,
  flavour: ExportFlavour,
  title: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const meta = await api.get<{
    leaves: ExportLeaf[];
    sourceUrl: string | null;
    leafCount: number;
  }>(`/api/documents/${documentId}/export?flavour=${flavour}`);

  if (!meta.ok) return { ok: false, message: meta.error.message };

  const tokens = resolveTokens();

  const leaves: ExportLeaf[] = meta.data.leaves.map((leaf) => ({
    ...leaf,
    annotations: leaf.annotations.map((annotation) => ({
      ...annotation,
      colorHex: toHex(
        tokens[annotation.colorHex] ?? annotation.colorHex ?? "#FFE27A",
      ),
    })),
  }));

  let sourcePdf: Uint8Array | null = null;
  if (meta.data.sourceUrl) {
    const response = await fetch(meta.data.sourceUrl).catch(() => null);
    if (!response?.ok) {
      return { ok: false, message: "Could not read the document's pages." };
    }
    sourcePdf = new Uint8Array(await response.arrayBuffer());
  }

  // pdf-lib and the typesetter are only loaded when someone actually exports,
  // so they never touch the viewer's first-load budget.
  const [{ bakeExport }, { typesetInto }] = await Promise.all([
    import("./bake"),
    import("./typeset-client"),
  ]);

  const bytes = await bakeExport({
    sourcePdf,
    leaves,
    flavour,
    title,
    typesetNote: (pdf: PDFDocument, markdown: string) =>
      typesetInto(pdf, markdown, true),
    // The same live computed styles the annotation colours came from, so a
    // formatted note exported from dark mode keeps the colours its author saw.
    resolveToken: (key: string) => toHex(tokens[key] ?? "#1C1B18"),
  });

  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${title.replace(/[^\w\s-]/g, "").trim() || "quaderno"}${
    flavour === "notes-only" ? " — notes" : ""
  }.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Revoked on the next tick; revoking immediately can cancel the download in
  // some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  return { ok: true };
}
