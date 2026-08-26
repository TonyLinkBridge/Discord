import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/internal/rayfox-setup": ["./drizzle/**/*"],
  },
};

export default nextConfig;
