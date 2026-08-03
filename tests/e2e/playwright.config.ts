import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

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

export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  fullyParallel: true,

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
  // re-prove the same two smoke assertions; cross-browser coverage earns its place
  // once there is browser-specific behaviour — the editor and the collaboration
  // transport — to disagree about.
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

  // Both services are started from their production output, which the `test:e2e`
  // task in `turbo.json` guarantees is present by depending on both application
  // builds. Ports are passed as arguments and environment variables rather than
  // read from a file, because this repository has no `.env` loading.
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
      env: { API_PORT: String(API_PORT) },
      // The readiness probe is the endpoint under test, so the suite starts only
      // once the service is genuinely answering rather than after a fixed wait.
      url: `${API_BASE_URL}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
