import path from 'node:path';
import type { NextConfig } from 'next';

// The monorepo root. Next.js otherwise infers it by scanning upwards for lockfiles
// and can select a directory outside the repository on some developer machines.
const workspaceRoot = path.join(__dirname, '..', '..');

const nextConfig: NextConfig = {
  turbopack: {
    root: workspaceRoot,
  },
  // Emits `.next/standalone`: a self-contained server carrying only the modules the
  // application actually reaches. That is what the production container runs, and it
  // is why the runtime image needs no package manager and no `node_modules` install.
  // This is an additional output, so `next dev` and `next start` are unaffected — the
  // Playwright suite still starts the app with `next start`.
  output: 'standalone',
  // Tracing has to start at the monorepo root. Left at the default, it would begin at
  // `apps/web` and miss every dependency pnpm resolved through the workspace store,
  // producing a standalone bundle that cannot boot.
  outputFileTracingRoot: workspaceRoot,
};

export default nextConfig;
