import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pino", "pino-pretty"],
  turbopack: {
    root: __dirname,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  experimental: {
    // Global body size limit for Server Actions and Route Handlers
    // This is the only production-ready option for App Router in Next.js 16
    // (per-route body size config is not supported in App Router)
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
