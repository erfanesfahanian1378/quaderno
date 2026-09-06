import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
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
};

export default nextConfig;
