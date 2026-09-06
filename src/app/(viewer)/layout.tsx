/**
 * The viewer's own layout — deliberately outside `(app)`.
 *
 * DESIGN_BRIEF §5.7: the document is the brightest thing on screen and the
 * interface recedes. A sidebar and a bottom tab bar around a page of a handout
 * is the opposite of that, and on mobile the tab bar would sit exactly where
 * the annotation toolbar has to go.
 *
 * Auth is still enforced: `/d/` is in the middleware matcher, and the page
 * itself calls `requireUserPage`.
 */
export default function ViewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="h-dvh overflow-hidden">{children}</div>;
}

export const dynamic = "force-dynamic";
