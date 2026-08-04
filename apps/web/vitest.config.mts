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
// the DOM environment, the React plugin, the `@/` alias, and the setup file.
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
