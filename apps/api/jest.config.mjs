// Jest configuration for the fast `apps/api` suite.
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
  rootDir: '.',

  // Confines test discovery to hand-written source. `dist/` and `tests/` both sit
  // outside it, so neither a stale build nor the PostgreSQL-backed suite can be
  // picked up here.
  roots: ['<rootDir>/src'],

  // `ts-jest` type-checks as it transforms, so a spec that does not compile fails
  // the run rather than being silently transpiled. It reads `tsconfig.test.json`,
  // which is `tsconfig.json` plus the two source mappings below — including
  // `emitDecoratorMetadata`, the setting Nest's dependency injection depends on.
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  moduleFileExtensions: ['js', 'json', 'ts'],

  // **This is what keeps `pnpm test` build-free.** Both workspace packages are
  // built for production — `apps/api` loads them from `dist` under Node and in
  // Docker — but a suite that needed those builds would make the fast command
  // run `prisma generate` and two `tsc` invocations before its first assertion.
  // So the fast suite reads their TypeScript instead.
  //
  // These are the real modules, not stand-ins: the same schemas the API
  // validates against, and the same `PersistenceError` class it throws. Mapping
  // the bare specifier rather than individual files is deliberate — if the
  // production code resolved `PersistenceError` from `dist` while a test
  // constructed one from source, they would be two classes and `instanceof`
  // would silently stop matching.
  //
  // `@devsync/database` maps to `contracts.ts`, the part of that package with no
  // Prisma import in it. A fast test that reached for `createDatabase` would fail
  // to resolve, which is the correct outcome: opening a real connection belongs
  // to `pnpm test:db`.
  //
  // `jest.db.config.mjs` carries no mapping at all, on purpose. That suite loads
  // the compiled packages, because proving the real ones work is its whole job.
  moduleNameMapper: {
    '^@devsync/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@devsync/database$': '<rootDir>/../../packages/database/src/contracts.ts',
  },

  // `*.spec.ts` only. `*.e2e-spec.ts` is deliberately not matched: browser and
  // full-stack coverage belongs to Playwright in `tests/e2e`, and having two
  // things called "e2e" in one repository is worse than having one.
  testRegex: '.*\\.spec\\.ts$',
  testEnvironment: 'node',

  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    // The tests themselves are not the thing being measured.
    '!src/**/*.spec.ts',
    // The process bootstrap. It calls `app.listen`, so importing it from an
    // in-process test would bind a port as a side effect of measuring it. The
    // Playwright suite runs the built `dist/main.js` for real instead, which is
    // the only way this file is genuinely exercised.
    '!src/main.ts',
  ],
};

export default config;
