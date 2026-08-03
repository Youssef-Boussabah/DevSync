// Jest configuration for `apps/api`.
//
// `apps/api` stays on Jest. It was already working with `ts-jest` and Supertest,
// and the NestJS testing package it drives is written against Jest's API, so
// moving to Vitest would mean adding decorator-metadata handling through SWC or
// Babel to solve a problem this workspace does not have. Uniformity with
// `apps/web` is not worth that; see `docs/testing.md`.
//
// Lifted out of `package.json` so the decisions below can carry their reasons.

/** @type {import('jest').Config} */
const config = {
  // Confines both test discovery and the module registry to hand-written source.
  // `dist/` sits outside it, so a stale build can never be picked up as a second
  // copy of a suite.
  rootDir: 'src',

  // `ts-jest` type-checks as it transforms, so a spec that does not compile fails
  // the run rather than being silently transpiled. It reads `apps/api/tsconfig.json`,
  // which is where `emitDecoratorMetadata` is switched on — the setting Nest's
  // dependency injection depends on.
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleFileExtensions: ['js', 'json', 'ts'],

  // `*.spec.ts` only. `*.e2e-spec.ts` is deliberately not matched: browser and
  // full-stack coverage belongs to Playwright in `tests/e2e`, and having two
  // things called "e2e" in one repository is worse than having one.
  testRegex: '.*\\.spec\\.ts$',
  testEnvironment: 'node',

  coverageDirectory: '../coverage',
  collectCoverageFrom: [
    '**/*.ts',
    // The tests themselves are not the thing being measured.
    '!**/*.spec.ts',
    // The process bootstrap. It calls `app.listen`, so importing it from an
    // in-process test would bind a port as a side effect of measuring it. The
    // Playwright suite runs the built `dist/main.js` for real instead, which is
    // the only way this file is genuinely exercised.
    '!main.ts',
  ],
};

export default config;
