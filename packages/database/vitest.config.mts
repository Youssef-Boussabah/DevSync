import { coverageDefaults, ignoredDirectories, testFileGlobs } from '@devsync/config/vitest/base';
import { defineConfig } from 'vitest/config';

// Vitest configuration for `packages/database`.
//
// These tests are integration tests: they run against a real PostgreSQL, and
// `tests/global-setup.ts` refuses to start unless it is pointed at a database it
// can prove is disposable. They are not part of `pnpm test`; `pnpm test:db` is
// what runs them, and it is the only command in the repository that expects an
// external service.
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: [...testFileGlobs],
    exclude: [...ignoredDirectories, 'src/generated/**'],

    // Resets the schema and applies the committed migrations once, before any
    // test file runs.
    globalSetup: ['./tests/global-setup.ts'],

    // One database, one worker. Two files truncating the same tables in parallel
    // is a flaky suite by construction, and per-worker isolation is not worth
    // building for a suite this size.
    fileParallelism: false,

    coverage: {
      ...coverageDefaults,
      include: ['src/**/*.ts'],
      exclude: [...coverageDefaults.exclude, 'src/generated/**'],
    },
  },
});
