import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root; Next otherwise walks up and can pick a lockfile
  // outside the project when inferring it.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
