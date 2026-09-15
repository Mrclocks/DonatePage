import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Small production image: only traced server files, not full node_modules.
  output: "standalone",
  // Native addon — keep external and ensure file tracing copies bindings.
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/better-sqlite3/**/*"],
  },
  poweredByHeader: false,
};

export default nextConfig;
