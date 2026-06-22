import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/campaigns", destination: "/marketing/campaigns", permanent: true },
      { source: "/campaigns/new", destination: "/marketing/campaigns/new", permanent: true },
      { source: "/campaigns/:id", destination: "/marketing/campaigns/:id", permanent: true },
    ];
  },
};

export default nextConfig;
