import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every Baptista page is per-user and dynamic (session cookies, household context), so
  // Cache Components/PPR add no value here; see decision D13 in docs/BAPTISTA_STATUS.md.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
