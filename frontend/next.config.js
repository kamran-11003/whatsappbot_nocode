/** @type {import('next').NextConfig} */
const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

const nextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
      { source: "/webhook/:path*", destination: `${BACKEND}/webhook/:path*` },
      { source: "/ws/:path*", destination: `${BACKEND}/ws/:path*` },
    ];
  },
};
module.exports = nextConfig;
