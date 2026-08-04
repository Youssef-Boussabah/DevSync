// Jest configuration for the API's PostgreSQL-backed integration suite.
//
// A second configuration rather than a second runner: these tests boot the real
// `AppModule` — configuration, database module, both controllers — against a real
// disposable PostgreSQL with the committed migration applied, so they need a
// database that `jest.config.mjs` deliberately guarantees no test needs.
//
// `pnpm test` must keep starting nothing, which is why the two never share a
// pattern: the fast suite matches `*.spec.ts` under `src`, and this one matches
// `*.db-spec.ts` under `tests`.
//
// **No `moduleNameMapper` here, deliberately.** The fast suite redirects
// `@devsync/shared` and `@devsync/database` to their TypeScript sources so it can
// run with nothing built; this suite must load the compiled `dist` output that
// production loads, because proving the real packages work against a real
// database is the only thing it is for. Its Turborepo task depends on `^build`
// and `generate` for exactly that reason.
//
// The `test:db` script runs Jest through `node --experimental-vm-modules` rather
// than through its own shim. Prisma 7 loads its WebAssembly query compiler with a
// dynamic `import()`, and Jest's sandbox refuses one without that flag — so the
// real client cannot connect from inside a test without it. It changes nothing
// about the tests themselves, which stay CommonJS, and the fast suite does not
// need it because nothing there opens a connection.

/** @type {import('jest').Config} */
const config = {
  rootDir: '.',
  roots: ['<rootDir>/tests'],

  // The same transform the fast suite uses, so a spec that does not compile fails
  // the run rather than being silently transpiled.
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleFileExtensions: ['js', 'json', 'ts'],

  testRegex: '.*\\.db-spec\\.ts$',
  testEnvironment: 'node',

  // Resets the disposable database and applies the committed migration once,
  // before any test file runs, through the same safety gate `@devsync/database`
  // uses. It refuses to touch a database it cannot prove is throwaway.
  globalSetup: '<rootDir>/tests/global-setup.mjs',

  // One database, one worker. Two files emptying the same tables in parallel is a
  // flaky suite by construction, and per-worker isolation is not worth building
  // for a suite this size.
  maxWorkers: 1,

  // Generous, because the first test in a run waits for a real connection pool to
  // open. Nothing in the suite waits on a timer.
  testTimeout: 30_000,
};

export default config;
