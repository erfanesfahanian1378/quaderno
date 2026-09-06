import Link from "next/link";

/**
 * Split layout: form on the left (max 400px), and on the right a quiet
 * composition of a document page with a highlight and a hand-written margin
 * note — the product's promise in one image, no stock photography
 * (DESIGN_BRIEF §5.1). Mobile is the form alone.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-[400px]">
          <Link
            href="/"
            className="mb-8 inline-block font-reading text-h1 text-ink"
          >
            Quaderno
          </Link>
          {children}
        </div>
      </div>

      <aside
        aria-hidden="true"
        className="relative hidden items-center justify-center overflow-hidden bg-subtle p-12 lg:flex"
      >
        <PromiseComposition />
      </aside>
    </div>
  );
}

/** A page of a handout, marked up the way you would mark up paper. */
function PromiseComposition() {
  return (
    <div className="w-full max-w-[420px] rotate-[-1.5deg]">
      <div className="page-sheet p-8 shadow-e3">
        <p className="font-mono text-caption uppercase tracking-[0.08em] text-ink-3">
          Lezione 12 — il passato prossimo
        </p>

        <p className="mt-5 font-reading text-note-body text-ink">
          Si usa il passato prossimo per{" "}
          <mark className="bg-[var(--hl-yellow)] text-ink [box-shadow:0_0_0_2px_var(--hl-yellow)]">
            un&apos;azione conclusa
          </mark>{" "}
          in un momento preciso. L&apos;imperfetto, invece, descrive{" "}
          <mark className="bg-[var(--hl-green)] text-ink [box-shadow:0_0_0_2px_var(--hl-green)]">
            una situazione abituale
          </mark>
          .
        </p>

        <p className="mt-4 font-reading text-note-body text-ink-2">
          Ieri <em>ho studiato</em> due ore. Da bambino <em>studiavo</em> ogni
          giorno.
        </p>

        {/* The margin note — the user's own page, slotted in. */}
        <div className="mt-6 border-l-2 border-accent pl-3">
          <p className="font-reading text-body italic text-ink-2">
            chiedere alla prof: e con &ldquo;mentre&rdquo;?
          </p>
        </div>
      </div>

      <p className="mt-6 text-center text-body-sm text-ink-2">
        Your class, your marks, your pages, your hours — in one place.
      </p>
    </div>
  );
}
