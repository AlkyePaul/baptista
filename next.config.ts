import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every Baptista page is per-user and dynamic (session cookies, household context), so
  // Cache Components/PPR add no value here; see decision D13 in docs/BAPTISTA_STATUS.md.
  cacheComponents: false,
  experimental: {
    // Wardrobe photos: the browser downsizes before upload (D29), this is the hard ceiling for
    // the server-side checks (10 MB file + multipart overhead). Vercel still caps bodies at 4.5 MB.
    serverActions: { bodySizeLimit: "11mb" },
    proxyClientMaxBodySize: "11mb",
  },
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
