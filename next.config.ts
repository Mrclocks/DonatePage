import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Full next start in Docker is more reliable with native modules (better-sqlite3).
  poweredByHeader: false,
};

export default nextConfig;
