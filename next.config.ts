import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pino", "pino-pretty"],
  // `next dev` refuses to serve its own assets cross-origin, which silently breaks hydration
  // when the dev server is reached by LAN/VPN address instead of localhost. Set
  // ALLOWED_DEV_ORIGINS to a comma-separated host list to allow those origins.
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
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
