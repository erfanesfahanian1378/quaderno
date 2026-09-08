"use client";

import { useEffect, useState } from "react";
import * as writes from "@/lib/outbox/writes";
import { Banner, Button } from "@/components/ui";

/**
 * What is still waiting to reach the server, and what to do about a conflict.
 *
 * A queue nobody can see is a queue nobody trusts. Two states matter and they
 * are not the same thing: **waiting** is fine and needs no attention, while
 * **conflicted** is a question only the reader can answer and will sit there
 * for ever until they do.
 */
export function PendingWrites() {
  const [items, setItems] = useState<writes.QueuedWrite[] | null>(null);

  useEffect(() => writes.subscribe(setItems), []);

  if (!items || items.length === 0) return null;

  const conflicts = items.filter((item) => item.conflict);
  const waiting = items.filter((item) => !item.conflict);

  return (
    <div className="flex flex-col gap-3">
      {waiting.length > 0 ? (
        <p className="text-body-sm text-ink-2">
          {waiting.length} change{waiting.length === 1 ? "" : "s"} waiting to
          sync. They are saved on this device and will send by themselves.
        </p>
      ) : null}

      {conflicts.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Banner tone="warning">
            {conflicts.length === 1
              ? "A change"
              : `${conflicts.length} changes`}{" "}
            could not be saved because the same thing changed somewhere else.
            Nothing has been lost — choose which copy to keep.
          </Banner>

          {conflicts.map((item) => (
            <div
              key={item.id}
              className="rounded-md border border-hairline bg-surface p-3"
            >
              <p className="text-label text-ink">{item.label}</p>
              <p className="mt-0.5 text-caption text-ink-3">
                Written here at{" "}
                {new Date(item.queuedAt).toLocaleString(undefined, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {item.conflict?.message ? ` · ${item.conflict.message}` : ""}
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => void writes.resolveKeepMine(item.id)}
                >
                  Keep what I wrote here
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void writes.resolveKeepTheirs(item.id)}
                >
                  Keep the server&apos;s version
                </Button>
              </div>

              <p className="mt-1.5 text-caption text-ink-3">
                Keeping yours overwrites the other copy. Keeping the
                server&apos;s discards what you wrote on this device.
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
