import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Vitest configuration for `apps/web`, and only for `apps/web`.
//
// It is deliberately not routed through `@devsync/config`: this is the single
// Vitest workspace in the repository today, so a shared base would add
// indirection without removing duplication. The moment a second workspace needs
// Vitest, the parts below that are not Next.js-specific — the include globs and
// the coverage settings — move into `@devsync/config`, exactly as the TypeScript
// and ESLint configuration did in Phase A1.
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
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/.turbo/**', '**/coverage/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      // Everything the application ships. Files with no test are reported at 0%
      // rather than hidden, so the number is the real one.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.{test,spec}.{ts,tsx}'],
      // No thresholds. One page component is too small a base for a percentage to
      // mean anything, and a threshold met by a tiny foundation invites tests
      // written to satisfy the number. Thresholds belong to the milestone that
      // introduces substantive application logic.
    },
  },
});
