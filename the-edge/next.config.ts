import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  experimental: {
    optimizePackageImports: ["@anthropic-ai/sdk", "@supabase/supabase-js"],
  },
};

export default nextConfig;
