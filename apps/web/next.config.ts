import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pin the workspace root to the monorepo root. Without this, Next.js infers the
  // root by scanning upwards for lockfiles and can select a directory outside the
  // repository on some developer machines.
  turbopack: {
    root: path.join(__dirname, '..', '..'),
  },
};

export default nextConfig;
