import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';

// Ports reserved for end-to-end runs. Development uses 3000 and 3001, so a suite
// started while `pnpm dev` is running neither collides with it nor silently tests
// it: `reuseExistingServer` is off below, so anything already listening on these
// two ports is an error rather than an accidental test subject.
const WEB_PORT = 4310;
const API_PORT = 4311;

const WEB_BASE_URL = `http://127.0.0.1:${WEB_PORT}`;
const API_BASE_URL = `http://127.0.0.1:${API_PORT}`;

// Resolved from this file rather than from the working directory, so the suite
// behaves the same whether it is started by Turborepo, by pnpm, or by hand.
const repoRoot = path.resolve(__dirname, '..', '..');
const webDir = path.join(repoRoot, 'apps', 'web');
const apiDir = path.join(repoRoot, 'apps', 'api');

// From C1 the API refuses to start without a database, so this suite needs one.
// It uses the disposable `devsync_test` database rather than the development
// one, which `tools/run-e2e.mjs` resets and migrates before any of this runs.
//
// Read after this, never before: dotenv does not overwrite a value already in the
// environment, so whatever `tools/run-e2e.mjs` set still wins.
loadDotenv({ path: [path.join(repoRoot, '.env')], quiet: true });

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (testDatabaseUrl === undefined || testDatabaseUrl === '') {
  throw new Error(
    'TEST_DATABASE_URL is not set, and the API under test will not start without a database. ' +
      'Start PostgreSQL with `docker compose up -d database` and set it — `.env.example` has the ' +
      'value to copy.',
  );
}

// The web application under test is a **production build**, and C3 embeds the API
// origin into it at build time. A build made for any other origin would be a
// browser calling a server this suite never started, so the mismatch is refused
// here rather than diagnosed later from a page of failed requests.
const builtApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

if (builtApiUrl !== API_BASE_URL) {
  throw new Error(
    `This suite starts the API on ${API_BASE_URL}, but the web build points at ` +
      `${builtApiUrl ?? '(nothing)'}. NEXT_PUBLIC_API_URL is embedded by \`next build\`, so run ` +
      '`pnpm test:e2e` from the repository root, which builds the applications with the values ' +
      'this suite needs.',
  );
}

export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',

  // **Serial, from C3.** The browser tests now write: they create projects and
  // files through the real interface, against one schema in one database. Running
  // them concurrently would make the project list a shared mutable fixture, and a
  // suite whose assertions depend on what another test happened to have created
  // is flaky by construction. Per-worker isolation is not worth building for a
  // suite this size; when it is, this is the setting that changes.
  fullyParallel: false,
  workers: 1,

  // No retries. Both services are started by this config and waited for by an
  // HTTP readiness check, so a failure here means something is genuinely broken.
  // A retry would convert that signal into an intermittent one.
  retries: 0,

  reporter: [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]],

  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  // Chromium only. A second engine would double the run time and the download to
  // re-prove the same behaviour; cross-browser coverage earns its place once there
  // is browser-specific behaviour — the editor and the collaboration transport —
  // to disagree about.
  projects: [
    {
      name: 'web',
      testMatch: /specs\/web\/.*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: WEB_BASE_URL },
    },
    {
      name: 'api',
      testMatch: /specs\/api\/.*\.spec\.ts$/,
      // No browser: these tests use the `request` fixture, and Playwright starts a
      // browser only when a test asks for one.
      use: { baseURL: API_BASE_URL },
    },
  ],

  // Both applications are started from their production output, which the
  // `test:e2e` task in `turbo.json` guarantees is present by depending on both
  // builds.
  //
  // The port, the database URL, and the allowed browser origin are passed
  // explicitly rather than left to the child process. `apps/api` does load `.env`,
  // and that is exactly why: inheriting it would point the API under test at the
  // development database and let it answer a browser on port 3000, neither of
  // which is what this suite is.
  webServer: [
    {
      command: `pnpm exec next start --port ${WEB_PORT}`,
      cwd: webDir,
      url: WEB_BASE_URL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'node dist/main.js',
      cwd: apiDir,
      // The test database, never the development one. The API connects during
      // startup, so a readiness check that answers is also proof the connection
      // was made. `WEB_ORIGIN` is the port the browser in this suite loads from,
      // and the only origin the API will answer cross-origin.
      env: {
        API_PORT: String(API_PORT),
        DATABASE_URL: testDatabaseUrl,
        WEB_ORIGIN: WEB_BASE_URL,
      },
      // The readiness probe is the endpoint under test, so the suite starts only
      // once the service is genuinely answering rather than after a fixed wait.
      url: `${API_BASE_URL}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
