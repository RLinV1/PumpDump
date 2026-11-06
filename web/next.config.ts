import type { NextConfig } from "next";
import { loadRootEnv } from "./env.cjs";

loadRootEnv();

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    const origin = (process.env.API_ORIGIN ?? "http://127.0.0.1:8083").replace(/\/$/, "");
    return [{ source: "/api/:path*", destination: `${origin}/api/:path*` }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Keep the same Tailwind transform when using webpack to avoid Windows Turbopack worker crashes.
  webpack(config) {
    config.module.rules.push({ rules: [{ test: /\.css$/, enforce: "pre", use: ["@tailwindcss/turbopack"] }] });
    return config;
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
