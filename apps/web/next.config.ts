import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import type { NextConfig } from 'next';

// The monorepo root. Next.js otherwise infers it by scanning upwards for lockfiles
// and can select a directory outside the repository on some developer machines.
const workspaceRoot = path.join(__dirname, '..', '..');

// Next.js reads `.env` from the application's own directory, not from the
// repository root — so the one environment inventory the rest of DevSync shares
// (`.env.example` at the root, copied to `.env`) would be invisible here without
// this. `apps/api` loads the same file through `@nestjs/config`, and the database
// and end-to-end tooling through `dotenv`; this makes the web build the fourth
// reader of it rather than inventing a second file to keep in step.
//
// dotenv never overwrites a value already in the environment, so Compose, CI, and
// the end-to-end runner keep control of their own configuration. `NEXT_PUBLIC_*`
// values are read while the client bundle is compiled, which is why this has to
// happen here, in the configuration Next.js loads first, rather than at runtime.
loadDotenv({ path: path.join(workspaceRoot, '.env'), quiet: true });

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
