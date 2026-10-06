import type { NextConfig } from "next";

// GITHUB_PAGES=true builds a fully static site (no server, no API routes).
// The game then uses its built-in combination engine in the browser.
const isPages = process.env.GITHUB_PAGES === "true";
const basePath = isPages ? process.env.PAGES_BASE_PATH ?? "" : "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(isPages && {
    output: "export",
    basePath,
    trailingSlash: true,
    images: { unoptimized: true },
  }),
  env: {
    NEXT_PUBLIC_STATIC_EXPORT: isPages ? "true" : "false",
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
