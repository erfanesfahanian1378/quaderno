"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A bottom sheet. Dismisses on swipe-down, on backdrop tap, and on Escape.
 *
 * Sheets rather than dialogs on mobile, per DESIGN_BRIEF §4 — a dialog on a
 * phone puts its actions where the thumb cannot reach.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setDragY(0);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="absolute inset-0 bg-ink/30"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 flex max-h-[78dvh] flex-col rounded-t-lg border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)] shadow-e3"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: startY.current === null ? "transform 180ms" : "none",
        }}
        onTouchStart={(event) => {
          startY.current = event.touches[0]?.clientY ?? null;
        }}
        onTouchMove={(event) => {
          if (startY.current === null) return;
          const delta = (event.touches[0]?.clientY ?? 0) - startY.current;
          // Downward only: dragging up should not detach the sheet.
          if (delta > 0) setDragY(delta);
        }}
        onTouchEnd={() => {
          startY.current = null;
          if (dragY > 90) onClose();
          else setDragY(0);
        }}
      >
        <div className="flex shrink-0 flex-col items-center gap-2 pt-2">
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-inset" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
