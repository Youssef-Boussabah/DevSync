import { coverageDefaults, ignoredDirectories } from '@devsync/config/vitest/base';
import { defineConfig } from 'vitest/config';

// The pure half of `packages/database`, and the only half `pnpm test` runs.
//
// Classifying a driver failure is a decision about the structure of an exception. It
// needs no PostgreSQL, and — because `src/failure-classification.ts` imports
// nothing from Prisma — it needs no generated client either, so this suite runs
// in the fast command that generates nothing and starts nothing.
//
// Two things keep the two suites apart. This configuration names its own files
// explicitly rather than using the shared `testFileGlobs`, and
// `vitest.config.mts` excludes `tests/unit` — so `pnpm test:db` does not run
// these a second time and no test is counted twice.
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/unit/**/*.unit.test.ts'],
    exclude: [...ignoredDirectories, 'src/generated/**'],

    // Deliberately no `globalSetup`. The database suite drops a schema before it
    // starts; nothing in this one may.

    coverage: {
      ...coverageDefaults,
      include: ['src/failure-classification.ts'],
    },
  },
});
