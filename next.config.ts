import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  /*
   * Build output directory, overridable.
   *
   * The offline e2e suite runs `next build` against a production server while
   * a dev server is usually already running — and both default to `.next`.
   * The build replaces the dev server's chunks underneath it, and the next
   * page it serves dies with `Cannot find module './8039.js'`. It looks like
   * a corrupted install and is not: it is two Next processes sharing one
   * directory.
   *
   * The offline config sets NEXT_DIST_DIR so its build lands elsewhere.
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactStrictMode: true,

  /*
   * Hide the dev-tools bubble.
   *
   * It anchors bottom-left, exactly where the viewer's hand tool sits, and on
   * a phone it covers it — the first toolbar button cannot be tapped. It never
   * appears in a production build, so this only affects `pnpm dev`, where it
   * was getting in the way of testing the thing it overlaps.
   */
  devIndicators: false,
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
  images: {
    // Thumbnails come from the object store; the host is configured per env.
    remotePatterns: process.env.NEXT_PUBLIC_STORAGE_ORIGIN
      ? [new URL(`${process.env.NEXT_PUBLIC_STORAGE_ORIGIN}/**`)]
      : [],
  },
  experimental: {
    // pdf.js and pdf-lib are heavy; keep them out of the server bundle.
    optimizePackageImports: [],
  },

  /*
   * In DEVELOPMENT, /sw.js serves a worker that deletes itself.
   *
   * Next names dev chunks by route — `app/(app)/settings/page.js`,
   * `webpack.js` — and changes their contents on every edit, where a
   * production build content-hashes every filename. The service worker treats
   * `/_next/static` as immutable, which is true of exactly one of those two.
   * Cached in dev, it serves last hour's module table and webpack dies on a
   * module id that is no longer there:
   *
   *     Cannot read properties of undefined (reading 'call')
   *
   * The error names neither the cache nor the worker, points at whichever
   * component happens to be in the stack, and survives every edit made to fix
   * it — because the edits never reach the browser. It cost a full round of
   * "fixed it" / "still broken" here.
   *
   * `beforeFiles` because it has to win against the real public/sw.js.
   */
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];

    return {
      beforeFiles: [{ source: "/sw.js", destination: "/sw-dev-reset.js" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
