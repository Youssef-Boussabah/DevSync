import { coverageDefaults, ignoredDirectories, testFileGlobs } from '@devsync/config/vitest/base';
import { defineConfig } from 'vitest/config';

// Vitest configuration for `@devsync/restart`.
//
// These are tests of the harness, not of the harness's subject. They cover the
// pure helpers the restart runner is built from — the redaction, the safety
// guards, the bounded waiting, the fixture comparison — with a fake clock and
// synthetic input, so they start nothing and reach nothing.
//
// The real C4 proof is `pnpm test:restart`, which drives Docker, PostgreSQL, the
// migration service, and the API. Nothing here substitutes for it, and nothing
// here mocks Docker: a suite that did would be able to report that restart
// persistence works without a container ever having existed.
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: [...testFileGlobs],
    exclude: [...ignoredDirectories],

    coverage: {
      ...coverageDefaults,
      include: ['lib/**/*.mjs'],
    },
  },
});
