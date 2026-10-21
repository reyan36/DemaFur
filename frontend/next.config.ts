import type { NextConfig } from "next";

const API_DESTINATION =
  (process.env.NEXT_PUBLIC_API_URL || "https://demafur.onrender.com").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/v1/:path*",
        destination: `${API_DESTINATION}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
