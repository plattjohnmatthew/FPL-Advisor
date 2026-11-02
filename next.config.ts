import type { NextConfig } from "next";

const outputDirectory = process.env.FPL_NEXT_DIST_DIR || ".next";
if (![".next", ".next-public-check", ".next-private-check"].includes(outputDirectory)) throw new Error("FPL_NEXT_DIST_DIR must be .next, .next-public-check or .next-private-check");
const nextConfig: NextConfig = {
  images: { unoptimized: process.env.APP_MODE === "public_read_only" },
  distDir: outputDirectory,
  outputFileTracingIncludes: { "/*": ["./data/public-snapshots/*.json"] },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
