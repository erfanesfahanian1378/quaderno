import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { ThemeScript } from "@/components/theme/ThemeScript";
import "@/styles/globals.css";

/*
 * DESIGN_BRIEF §3.3 requires Latin Extended-A in both families:
 * `à è é ì ò ù ç œ â ê î ô û ë ï ü` appear constantly in an app for Italian
 * and French, and a font that drops them is a shipping blocker. Hence the
 * explicit latin-ext subset on every family.
 *
 * These are self-hosted: next/font downloads the woff2 files at BUILD time
 * and serves them from our own origin, so there is no runtime request to a
 * third party. It also emits size-adjusted fallback metrics, which is what
 * keeps CLS at zero while the face loads.
 */
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600"],
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  variable: "--font-source-serif",
  display: "swap",
  weight: ["400", "600"],
  style: ["normal", "italic"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "Quaderno",
    template: "%s · Quaderno",
  },
  description:
    "A study notebook for language learners. Your class, your marks, your pages, your hours — in one place.",
  applicationName: "Quaderno",
  appleWebApp: { capable: true, title: "Quaderno", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The viewer needs pinch-zoom; never lock it. Accessibility, not a nicety.
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F6F3" },
    { media: "(prefers-color-scheme: dark)", color: "#16161A" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${sourceSerif.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh bg-canvas font-ui text-body text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
