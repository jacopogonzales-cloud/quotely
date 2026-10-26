import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-only Next.js badge defaults to bottom-left, where it covers the nav rail's Settings
  // and avatar and its "Issues" pill reaches into the inbox list.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
