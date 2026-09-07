"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Banner, Button } from "@/components/ui";

type Link = {
  id: string;
  token: string;
  label: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
};

/**
 * Read-only share links for one document.
 *
 * The copy here is doing real work. A share link is the only way anything in
 * this app leaves the owner's account, so the panel says plainly what a
 * recipient can see — the pages AND the marks — before the link is made,
 * rather than after someone has already sent it.
 */
export function ShareLinks({ documentId }: { documentId: string }) {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.get<{ links: Link[] }>(
      `/api/documents/${documentId}/shares`,
    );
    if (result.ok) setLinks(result.data.links);
    else setError(result.error.message);
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    setError(null);
    const result = await api.post<{ link: Link }>(
      `/api/documents/${documentId}/shares`,
      {},
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setLinks((current) => [result.data.link, ...(current ?? [])]);
  };

  const revoke = async (id: string) => {
    setError(null);
    const result = await api.delete(`/api/shares/${id}`);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setLinks((current) => (current ?? []).filter((link) => link.id !== id));
  };

  const copy = async (token: string) => {
    const url = `${window.location.origin}/s/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /*
       * The clipboard API needs a secure context and a user gesture, and
       * refuses on a plain-http LAN address — the same rule that governs
       * crypto.randomUUID and getUserMedia. Show the URL so it can be copied
       * by hand rather than failing silently.
       */
      window.prompt("Copy this link", url);
    }
  };

  const live = (links ?? []).filter((link) => !link.revokedAt);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-label text-ink">Share</p>

      {error ? <Banner tone="danger">{error}</Banner> : null}

      {live.length === 0 ? (
        <p className="text-caption text-ink-3">
          A link lets anyone who has it read this document — the pages and your
          marks — without signing in. They cannot change anything, and you can
          revoke it at any time.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {live.map((link) => (
          <li
            key={link.id}
            className="rounded-sm border border-hairline p-2 text-caption"
          >
            <code className="block truncate text-ink-2">/s/{link.token}</code>

            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void copy(link.token)}
                className="text-accent underline underline-offset-2"
              >
                {copied === link.token ? "Copied" : "Copy link"}
              </button>

              <button
                type="button"
                onClick={() => void revoke(link.id)}
                className="text-danger underline underline-offset-2"
              >
                Revoke
              </button>

              <span className="ml-auto text-ink-3">
                {link.viewCount === 0
                  ? "not opened"
                  : `${link.viewCount} ${link.viewCount === 1 ? "view" : "views"}`}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => void create()}
        loading={busy}
        className="self-start"
      >
        Create a link
      </Button>
    </div>
  );
}
