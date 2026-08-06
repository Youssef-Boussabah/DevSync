import { fileURLToPath } from 'node:url';
import { coverageDefaults, ignoredDirectories, testFileGlobs } from '@devsync/config/vitest/base';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Vitest configuration for `apps/web`.
//
// C1 added the second Vitest workspace — `packages/database` — so the parts that
// were never Next.js-specific now come from `@devsync/config`, exactly as this
// file said they would: the test globs, the directories to skip, and the
// coverage defaults. Everything below that is stated here is genuinely local:
// the DOM environment, the React plugin, the two aliases, the environment the
// application reads, and the setup file.
//
// The `.mts` extension is load-bearing: `apps/web` is a CommonJS package, and
// Vite's native config loader warns when it has to read ESM syntax out of a file
// it loaded as CommonJS.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Mirrors the `@/*` → `./src/*` alias in `apps/web/tsconfig.json`, which
      // Next.js resolves for `next dev`, `next build`, and `tsc`. Vitest does not
      // read `tsconfig.json`, so the alias has to be restated here or every test
      // import through `@/` fails to resolve.
      '@': fileURLToPath(new URL('./src', import.meta.url)),

      // **This is what keeps `pnpm test` build-free now that `apps/web` depends on
      // a package that builds.** `@devsync/shared` is a production dependency and
      // resolves through its `exports` map to `dist/` for `next build`, for
      // `next start`, and inside the container — but a suite that needed that
      // build would put two `tsc` invocations in front of the fast command's
      // first assertion.
      //
      // So the component suites read the package's TypeScript instead. It is the
      // real module, not a copy: the same schemas the API validates every request
      // against, so a test cannot pass against a contract that does not exist.
      // `apps/api/jest.config.mjs` does the same thing for the same reason.
      '@devsync/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    // React components need a DOM. There is no Node-only suite in this workspace
    // yet; when one arrives it should opt out per file with a
    // `// @vitest-environment node` comment rather than jsdom being loosened
    // globally.
    environment: 'jsdom',
    // No `globals: true`. Tests import `describe`/`it`/`expect` from `vitest`
    // explicitly, so nothing this test runner defines leaks into the types or the
    // runtime of application code.
    globals: false,
    // The API origin the application refuses to start without. Stated here rather
    // than inherited, so the suite proves what it configured instead of depending
    // on whatever a developer's `.env` happens to say — and so it runs on a
    // machine with no `.env` at all.
    env: {
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3001',
    },
    setupFiles: ['./vitest.setup.ts'],
    include: [...testFileGlobs],
    exclude: [...ignoredDirectories],
    coverage: {
      ...coverageDefaults,
      // Everything the application ships. Files with no test are reported at 0%
      // rather than hidden, so the number is the real one.
      include: ['src/**/*.{ts,tsx}'],
    },
  },
});
