import { parseMeetingUrl } from "@/lib/meeting-url";
import { cn } from "@/lib/cn";

/**
 * One click into the class.
 *
 * `rel="noopener noreferrer"` is not decoration: without `noopener` the page
 * that opens gets a live `window.opener` handle back into this tab and can
 * navigate it somewhere else, which is a real phishing route for a link the
 * user pasted from an email.
 *
 * The URL is re-parsed here rather than trusted. It was validated before
 * storage, but a row can predate the validation or arrive from elsewhere, and
 * an `href` is the one place where being wrong is dangerous rather than ugly.
 */
export function JoinButton({
  url,
  size = "md",
  className,
}: {
  url: string | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  const link = url ? parseMeetingUrl(url) : null;
  if (!link) return null;

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent font-medium text-accent-on transition-opacity duration-[120ms] hover:opacity-90",
        size === "sm" ? "h-8 px-2.5 text-caption" : "h-10 px-4 text-label",
        className,
      )}
      title={link.url}
    >
      <VideoIcon />
      Join
      <span className="hidden sm:inline opacity-80">· {link.provider}</span>
    </a>
  );
}

function VideoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="m15 11 6-3.5v9L15 13" />
    </svg>
  );
}
