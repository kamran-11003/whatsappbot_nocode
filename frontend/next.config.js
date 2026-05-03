/** @type {import('next').NextConfig} */
// /api/* and /webhook/* are handled by Next.js Route Handlers (app/api and app/webhook)
// which read BACKEND_URL at runtime. Only /ws/* stays as a rewrite for WebSocket upgrades.
const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

const nextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      { source: "/ws/:path*", destination: `${BACKEND}/ws/:path*` },
    ];
  },
};
module.exports = nextConfig;
