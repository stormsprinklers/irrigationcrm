import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/campaigns", destination: "/marketing/campaigns", permanent: true },
      { source: "/campaigns/new", destination: "/marketing/campaigns/new", permanent: true },
      { source: "/campaigns/:id", destination: "/marketing/campaigns/:id", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Content-Type", value: "application/manifest+json" },
        ],
      },
      {
        // Allow geolocation for parts runs / en-route ETA inside the PWA.
        source: "/(.*)",
        headers: [
          {
            key: "Permissions-Policy",
            value: "geolocation=(self), notifications=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
