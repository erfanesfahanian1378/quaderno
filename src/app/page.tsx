import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserId } from "@/server/auth/guards";
import { Button } from "@/components/ui";

/**
 * The front door.
 *
 * A signed-in user never sees this — they go straight to their dashboard,
 * because this is a tool people open every day and a marketing page between
 * them and their notes is friction, not welcome.
 */
export default async function Home() {
  if (await currentUserId()) redirect("/dashboard");

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-[440px]">
          <p className="font-mono text-caption uppercase tracking-[0.08em] text-ink-3">
            Quaderno
          </p>

          <h1 className="mt-3 font-reading text-display text-ink">
            Your class, your marks, your pages, your hours — in one place.
          </h1>

          <p className="mt-4 text-body text-ink-2">
            Bring your handouts in, mark them up the way you would mark up
            paper, and slot your own written pages straight into the same
            document. A timer keeps an honest record of what you actually
            studied.
          </p>

          <ul className="mt-6 flex flex-col gap-2 text-body-sm text-ink-2">
            <Point>
              PDFs, Word files, slide decks and photos all become the same
              thing, so every feature works on every format.
            </Point>
            <Point>
              Highlight, draw, and write your own page between page 3 and page 4
              of the teacher&apos;s handout — their file is never changed.
            </Point>
            <Point>
              Weekly goals and a year of hours, shown as information rather than
              praise.
            </Point>
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/sign-up">
              <Button size="lg">Create an account</Button>
            </Link>
            <Link href="/sign-in">
              <Button size="lg" variant="secondary">
                Sign in
              </Button>
            </Link>
          </div>

          {process.env.NODE_ENV !== "production" ? (
            <p className="mt-8 text-caption text-ink-3">
              Development:{" "}
              <Link href="/dev/tokens" className="underline">
                design tokens
              </Link>
            </p>
          ) : null}
        </div>
      </div>

      <aside
        aria-hidden="true"
        className="relative hidden items-center justify-center overflow-hidden bg-subtle p-12 lg:flex"
      >
        <MarkedUpPage />
      </aside>
    </main>
  );
}

function Point({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden="true"
        className="mt-2 size-1.5 shrink-0 rounded-full bg-accent"
      />
      <span>{children}</span>
    </li>
  );
}

/** The promise in one image: a real page, marked up, with a page of your own. */
function MarkedUpPage() {
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

        <div className="mt-6 border-l-2 border-accent pl-3">
          <p className="font-reading text-body italic text-ink-2">
            chiedere alla prof: e con &ldquo;mentre&rdquo;?
          </p>
        </div>
      </div>

      {/* The user's own page, peeking out from behind the handout. */}
      <div className="page-sheet -mt-4 ml-8 rotate-[1.2deg] p-6 shadow-e2">
        <p className="font-mono text-caption uppercase tracking-[0.06em] text-ink-3">
          la mia pagina
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {[85, 70, 90, 55].map((width, index) => (
            <span
              key={index}
              className="h-[3px] rounded-full bg-hairline-strong"
              style={{ width: `${width}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
