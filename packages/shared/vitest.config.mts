import { coverageDefaults, ignoredDirectories, testFileGlobs } from '@devsync/config/vitest/base';
import { defineConfig } from 'vitest/config';

// Vitest configuration for `packages/shared`.
//
// Schemas and pure functions, so Node rather than jsdom and no setup file. These
// tests belong in `pnpm test`: they start nothing, build nothing, and run in
// milliseconds — which is the whole reason the contracts live in a package the
// API only reads rather than inside the API itself.
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: [...testFileGlobs],
    exclude: [...ignoredDirectories],

    coverage: {
      ...coverageDefaults,
      include: ['src/**/*.ts'],
    },
  },
});
