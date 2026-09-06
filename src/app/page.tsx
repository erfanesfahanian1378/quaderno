import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col justify-center gap-6 px-6">
      <p className="font-mono text-caption uppercase tracking-[0.08em] text-ink-3">
        Quaderno
      </p>
      <h1 className="font-reading text-display text-ink">
        Your class, your marks, your pages, your hours — in one place.
      </h1>
      <p className="text-body text-ink-2">
        A study notebook for language learners. Phase 01 is the foundation:
        tokens, theming, storage, jobs and the test harness. The product
        surfaces land in the phases after it.
      </p>
      <div className="flex gap-3">
        <Link
          href="/dev/tokens"
          className="rounded-md bg-accent px-4 py-2 text-label text-accent-on transition-opacity duration-[120ms] hover:opacity-90"
        >
          Design tokens
        </Link>
      </div>
    </main>
  );
}
