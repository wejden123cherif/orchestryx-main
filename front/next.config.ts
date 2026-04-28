import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables stricter runtime checks and safer route linking behavior.
  reactStrictMode: true,
  typedRoutes: true,
};

export default nextConfig;
