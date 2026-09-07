"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { Banner, Card, EmptyState } from "@/components/ui";

export type SharedLink = {
  id: string;
  token: string;
  documentTitle: string;
  viewCount: number;
  expiresAt: string | null;
  createdAt: string;
};

/**
 * Every live share link, in one place.
 *
 * The panel inside a document shows that document's links; this is the answer
 * to "what have I shared?", which nobody can reconstruct by opening documents
 * one at a time. A list of things that are readable without signing in should
 * be one page, not a search.
 */
export function SharedLinks({ initial }: { initial: SharedLink[] }) {
  const [links, setLinks] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const revoke = async (id: string) => {
    setError(null);
    const result = await api.delete(`/api/shares/${id}`);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setLinks((current) => current.filter((link) => link.id !== id));
  };

  if (links.length === 0) {
    return (
      <EmptyState
        title="Nothing shared"
        description="Share links are made from a document's Info panel. Anyone with the link can read that one document, and nothing else."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <Banner tone="danger">{error}</Banner> : null}

      {links.map((link) => (
        <Card key={link.id} className="p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-body text-ink">
                {link.documentTitle}
              </p>
              <p className="text-caption text-ink-3">
                {link.viewCount === 0
                  ? "Not opened yet"
                  : `${link.viewCount} ${link.viewCount === 1 ? "view" : "views"}`}
                {link.expiresAt
                  ? ` · expires ${new Date(link.expiresAt).toLocaleDateString()}`
                  : " · no expiry"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void revoke(link.id)}
              className="text-body-sm text-danger underline underline-offset-2"
            >
              Revoke
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
